import * as THREE from 'three';

// Opt in until the additional GPU cost is approved on the target device.
export const DEPTH_OF_FIELD_DEFAULTS = Object.freeze({ enabled: false,
  strength: 1, blurStart: 0.5, softness: 0.5, maxRadius: 3 });

const vertexShader = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const fragmentShader = `
precision highp float;
#include <packing>
varying vec2 vUv;
uniform sampler2D image, depthMap;
uniform vec2 texel, cameraRange, headRange;
uniform float startFraction, softness, radius, strength;
float linearDepth(float d){float z=d*2.-1.;return 2.*cameraRange.x*cameraRange.y /
  (cameraRange.y+cameraRange.x-z*(cameraRange.y-cameraRange.x));}
float amount(float d){return smoothstep(headRange.x+(headRange.y-headRange.x)*startFraction,
  headRange.x+(headRange.y-headRange.x)*(startFraction+max(softness,.001)),d);}
float readDepth(vec2 uv){return unpackRGBAToDepth(texture2D(depthMap,uv));}
void main(){
  vec4 center=texture2D(image,vUv);
  if(center.a<.0001) discard;
  float rawDepth=readDepth(vUv);
  // Never interpret missing transparent-strand depth as distant background.
  // A strand without nearby opaque/core coverage stays sharp, not haloed.
  if(rawDepth>=.999999){gl_FragColor=center;return;}
  float d=linearDepth(rawDepth), blur=amount(d)*strength;
  if(blur<.0001 || radius<.001){gl_FragColor=center;return;}
  vec3 sum=center.rgb*center.a; float weights=center.a;
  for(int i=0;i<8;i++){
    float a=float(i)*.78539816339;
    vec2 uv=vUv+vec2(cos(a),sin(a))*texel*radius*blur;
    vec4 sampleColor=texture2D(image,uv); float sd=readDepth(uv);
    // Keep sharp foreground and transparent background out of rear blur.
    float w=sampleColor.a*(sd<.999999?amount(linearDepth(sd)):0.);
    sum+=sampleColor.rgb*w;weights+=w;
  }
  gl_FragColor=vec4(sum/max(weights,.00001),center.a);
}`;

export function createDepthOfField({ renderer, scene, camera, postProcessing, colorGrading }) {
  const config = { ...DEPTH_OF_FIELD_DEFAULTS };
  let model = null, target = null, depthTarget = null, width = 1, height = 1, pixelRatio = 1;
  const depthMaterials = new Map(), depthArrays = new WeakMap();
  let rippleDisplay = null;
  let initializedRange = false;
  const compare = new URLSearchParams(location.search).get('dofCompare') === '1';
  let compareFrames = 0, compared = false;
  const entries = [];
  const point = new THREE.Vector3(), viewMatrix = new THREE.Matrix4();
  const clearColor = new THREE.Color();
  const quadScene = new THREE.Scene(), quadCamera = new THREE.Camera();
  const uniforms = { image: { value: null }, depthMap: { value: null },
    texel: { value: new THREE.Vector2() }, cameraRange: { value: new THREE.Vector2() },
    headRange: { value: new THREE.Vector2() }, startFraction: { value: config.blurStart },
    softness: { value: config.softness }, radius: { value: 0 }, strength: { value: 1 } };
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms,
    depthTest: false, depthWrite: false, toneMapped: false, transparent: false });
  const geometry = new THREE.PlaneGeometry(2, 2);
  quadScene.add(new THREE.Mesh(geometry, material));

  function setModel(root) {
    for(const cached of depthMaterials.values())cached.material.dispose();
    depthMaterials.clear();
    model = root; entries.length = 0; initializedRange = false;
    root.traverse(node => {
      if (!node.isMesh || !node.geometry) return;
      for (let p = node; p; p = p.parent) if (!p.visible) return;
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      entries.push({ node, bounds: node.geometry.boundingBox.clone(), savedMaterial: null });
    });
  }
  function setSize(w, h, dpr) {
    width = w; height = h; pixelRatio = dpr;
    target?.setSize(Math.max(1, Math.round(w*dpr)), Math.max(1, Math.round(h*dpr)));
    depthTarget?.setSize(Math.max(1,Math.round(w*dpr*.5)),Math.max(1,Math.round(h*dpr*.5)));
  }
  function depthMaterial(source) {
    if(Array.isArray(source)) {
      let array=depthArrays.get(source);
      if(!array){array=source.map(depthMaterial);depthArrays.set(source,array);}
      else for(let i=0;i<source.length;i++)array[i]=depthMaterial(source[i]);
      return array;
    }
    let cached=depthMaterials.get(source);
    if(!cached || cached.version!==source.version) {
      cached?.material.dispose();
      const mask=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
      for(const key of ['map','alphaMap','alphaTest','opacity','side','displacementMap','displacementScale','displacementBias','clippingPlanes','clipIntersection','clipShadows'])
        if(key in source)mask[key]=source[key];
      mask.blending=THREE.NoBlending;mask.depthWrite=true;mask.depthTest=true;
      mask.onBeforeCompile=(shader,activeRenderer)=>{
        source.onBeforeCompile.call(source,shader,activeRenderer);
        shader.uniforms.diffuse={value:new THREE.Color(0xffffff)};
        shader.uniforms.opacity={value:source.opacity};
        shader.fragmentShader='uniform vec3 diffuse;\n#if DEPTH_PACKING != 3200\nuniform float opacity;\n#endif\n'+shader.fragmentShader;
      };
      mask.customProgramCacheKey=()=>source.customProgramCacheKey()+'|dof-alpha-depth';
      cached={material:mask,version:source.version};depthMaterials.set(source,cached);
    }
    return cached.material;
  }
  function updateRange(delta) {
    let near = Infinity, far = -Infinity;
    camera.updateWorldMatrix(true, false);
    for (const entry of entries) {
      entry.node.updateWorldMatrix(true, false);
      viewMatrix.multiplyMatrices(camera.matrixWorldInverse, entry.node.matrixWorld);
      for (let i=0;i<8;i++) {
        point.set(i&1?entry.bounds.max.x:entry.bounds.min.x,
          i&2?entry.bounds.max.y:entry.bounds.min.y,
          i&4?entry.bounds.max.z:entry.bounds.min.z).applyMatrix4(viewMatrix);
        near=Math.min(near,-point.z);far=Math.max(far,-point.z);
      }
    }
    if (!Number.isFinite(near) || far<=near) return;
    const blend=initializedRange?1-Math.exp(-Math.max(delta,0)/.1):1;
    uniforms.headRange.value.x+= (near-uniforms.headRange.value.x)*blend;
    uniforms.headRange.value.y+= (far-uniforms.headRange.value.y)*blend;
    initializedRange=true;
  }
  function render(delta) {
    if (!config.enabled || config.strength<=0 || config.maxRadius<=0 || !model || postProcessing.enabled) {
      postProcessing.render(delta); return;
    }
    if (!target) {
      target = new THREE.WebGLRenderTarget(Math.max(1,Math.round(width*pixelRatio)),
        Math.max(1,Math.round(height*pixelRatio)), { type: THREE.UnsignedByteType,
          minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      target.samples = Math.min(4,renderer.capabilities.maxSamples);
      target.resolveDepthBuffer=false;
      depthTarget=new THREE.WebGLRenderTarget(Math.max(1,Math.round(width*pixelRatio*.5)),
        Math.max(1,Math.round(height*pixelRatio*.5)),{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
      uniforms.image.value=target.texture;uniforms.depthMap.value=depthTarget.texture;
    }
    renderer.info.reset();updateRange(delta);
    uniforms.cameraRange.value.set(camera.near,camera.far);
    uniforms.texel.value.set(1/target.width,1/target.height);
    uniforms.radius.value=config.maxRadius*(width/772)*pixelRatio;
    uniforms.startFraction.value=config.blurStart;uniforms.softness.value=config.softness;
    uniforms.strength.value=config.strength;
    const previousTarget=renderer.getRenderTarget(), previousBackground=scene.background;
    const previousAlpha=renderer.getClearAlpha(), previousAutoClear=renderer.autoClear;
    renderer.getClearColor(clearColor);
    rippleDisplay ||= scene.getObjectByName('BackgroundRippleDisplay');
    const background=rippleDisplay;
    const backgroundVisible=background?.visible, modelVisible=model.visible;
    let referencePixels = null;
    if (compare && !compared && ++compareFrames === 120) {
      uniforms.startFraction.value=1;
      renderer.setRenderTarget(previousTarget);renderer.render(scene,camera);
      referencePixels=new Uint8Array(target.width*target.height*4);
      renderer.getContext().readPixels(0,0,target.width,target.height,renderer.getContext().RGBA,
        renderer.getContext().UNSIGNED_BYTE,referencePixels);
    } else if (compare) uniforms.startFraction.value=1;
    try {
      if(background)background.visible=false;
      scene.background=null;
      renderer.setRenderTarget(target);renderer.setClearColor(0x000000,0);renderer.autoClear=true;
      colorGrading.uniforms.selfieGradeOffscreen.value=1;
      renderer.render(scene,camera);
      for(const entry of entries){entry.savedMaterial=entry.node.material;entry.node.material=depthMaterial(entry.savedMaterial);}
      renderer.setRenderTarget(depthTarget);renderer.setClearColor(0xffffff,1);
      renderer.render(scene,camera);
      for(const entry of entries){entry.node.material=entry.savedMaterial;entry.savedMaterial=null;}
      colorGrading.uniforms.selfieGradeOffscreen.value=0;
      if(background)background.visible=backgroundVisible;
      model.visible=false;scene.background=previousBackground;
      renderer.setRenderTarget(previousTarget);renderer.setClearColor(clearColor,previousAlpha);
      renderer.render(scene,camera);
      renderer.autoClear=false;renderer.render(quadScene,quadCamera);
      if(referencePixels) {
        const pixels=new Uint8Array(referencePixels.length),gl=renderer.getContext();
        gl.readPixels(0,0,target.width,target.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        let different=0,maximum=0,sum=0;
        for(let i=0;i<pixels.length;i++) { const error=Math.abs(pixels[i]-referencePixels[i]);
          if(error>1)different++;maximum=Math.max(maximum,error);sum+=error; }
        const coverage=new Uint8Array(pixels.length);
        renderer.readRenderTargetPixels(target,0,0,target.width,target.height,coverage);
        let interiorMaximum=0,interiorSum=0,interiorChannels=0;
        for(let y=3;y<target.height-3;y++)for(let x=3;x<target.width-3;x++) {
          let solid=true;
          for(let dy=-3;dy<=3;dy+=3)for(let dx=-3;dx<=3;dx+=3)
            if(coverage[((y+dy)*target.width+x+dx)*4+3]<255)solid=false;
          if(!solid)continue;
          const i=(y*target.width+x)*4;
          for(let c=0;c<3;c++){const e=Math.abs(pixels[i+c]-referencePixels[i+c]);
            interiorMaximum=Math.max(interiorMaximum,e);interiorSum+=e;interiorChannels++;}
        }
        const report=document.createElement('pre');report.dataset.dofComparison='';
        report.textContent=JSON.stringify({differentChannelsOverOne:different,maximumError:maximum,
          meanChannelError:sum/pixels.length,interiorMaximum,interiorMean:interiorSum/Math.max(1,interiorChannels),interiorChannels,width:target.width,height:target.height,
          note:'Explicit one-frame direct versus unblurred DOF comparison; includes MSAA edge differences.'});
        document.body.appendChild(report);compared=true;
      }
    } finally {
      for(const entry of entries)if(entry.savedMaterial){entry.node.material=entry.savedMaterial;entry.savedMaterial=null;}
      colorGrading.uniforms.selfieGradeOffscreen.value=0;
      model.visible=modelVisible;if(background)background.visible=backgroundVisible;
      scene.background=previousBackground;renderer.autoClear=previousAutoClear;
      renderer.setRenderTarget(previousTarget);renderer.setClearColor(clearColor,previousAlpha);
    }
  }
  return { config, setModel, setSize, render,
    get status() { return postProcessing.enabled ? 'Bypassed while FXAA is enabled' : config.enabled ? 'Character depth blur' : 'Disabled — direct renderer'; },
    dispose(){target?.dispose();depthTarget?.dispose();for(const cached of depthMaterials.values())cached.material.dispose();geometry.dispose();material.dispose();} };
}
