// Opt-in diagnostic only: ?rippleProfile=1. No queries, DOM, or render wrapping
// are installed in the ordinary viewer. Readbacks are asynchronous timer-query
// results, never pixel reads or gl.finish(). Use identical settings for A/B.
export function createFrameProfiler(renderer, ripple, registerActivity = () => {}) {
  if (new URLSearchParams(location.search).get('rippleProfile') !== '1') return null;
  const gl = renderer.getContext();
  const gpuScope = new URLSearchParams(location.search).get('gpuScope') || 'frame';
  const benchmarkMode = new URLSearchParams(location.search).get('rippleBenchmark');
  const controlled = ['1', 'stationary', 'slow', 'fast'].includes(benchmarkMode);
  const timer = new URLSearchParams(location.search).get('gpuTiming') === '0'
    ? null : gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const queries = timer ? Array.from({ length: 8 }, () => ({ query: gl.createQuery(), pending: false })) : [];
  const panel = document.createElement('aside');
  panel.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:10000;background:#111d;color:white;padding:8px;font:10px monospace;max-width:300px;max-height:180px;overflow:auto;pointer-events:auto';
  panel.innerHTML = '<button type="button">Start 12-second sample</button><pre data-ripple-profile style="white-space:pre-wrap;margin:4px 0"></pre>';
  document.body.append(panel);
  for (const event of ['pointerdown', 'pointermove', 'pointerup']) panel.addEventListener(event, e => e.stopPropagation());
  const output = panel.querySelector('pre');
  let active = false, start = 0, frameStart = 0, previousFrame = 0, lastUi = 0;
  let frames = 0, frameSum = 0, frameWorst = 0, cpuSum = 0, cpuWorst = 0, rippleSum = 0;
  let calls = 0, triangles = 0, renderPasses = 0, totalCalls = 0, totalPasses = 0, worstPasses = 0;
  let gpuSum = 0, gpuCount = 0, gpuWorst = 0, currentQuery = null, queryIndex = 0;
  let rippleStart = 0;
  let warmUntil = 0, orbitDistance = 0, orbitHeight = 0;
  const originalRender = renderer.render;
  renderer.render = function (scene, camera) {
    const beforeCalls = renderer.info.render.calls, beforeTriangles = renderer.info.render.triangles;
    originalRender.call(renderer, scene, camera);
    calls += renderer.info.render.calls - beforeCalls;
    triangles += renderer.info.render.triangles - beforeTriangles;
    renderPasses += 1;
  };
  panel.querySelector('button').addEventListener('click', () => {
    const warmup = controlled ? (['stationary', 'slow'].includes(benchmarkMode) ? 10000 : 3000) : 0;
    registerActivity(); active = true; start = performance.now() + warmup; previousFrame = 0;
    warmUntil = start; orbitDistance = 0;
    frames = frameSum = frameWorst = cpuSum = cpuWorst = rippleSum = totalCalls = totalPasses = worstPasses = 0;
    gpuSum = gpuCount = gpuWorst = 0;
    for (const slot of queries) slot.sample = false;
    output.textContent = controlled ? 'Warming controlled rotation…' : 'Sampling…';
  });
  output.textContent = timer ? 'GPU timer available. Ready.' : 'GPU timer unavailable. CPU/frame timings only. Ready.';
  function pollGpu() {
    if (!timer) return;
    const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT);
    for (const slot of queries) {
      if (!slot.pending || !gl.getQueryParameter(slot.query, gl.QUERY_RESULT_AVAILABLE)) continue;
      if (!disjoint && slot.sample) {
        const ms = gl.getQueryParameter(slot.query, gl.QUERY_RESULT) / 1e6;
        gpuSum += ms; gpuCount += 1; gpuWorst = Math.max(gpuWorst, ms);
      }
      slot.pending = false;
    }
  }
  function report(now) {
    const count = Math.max(frames, 1);
    output.textContent = JSON.stringify({ state: active ? 'sampling' : 'complete', seconds: +((now-start)/1000).toFixed(2),
      frames, fps: +(1000*count/Math.max(frameSum, 1)).toFixed(2), averageFrameMs: +(frameSum/count).toFixed(3),
      worstFrameMs: +frameWorst.toFixed(3), averageCpuMs: +(cpuSum/count).toFixed(3), worstCpuMs: +cpuWorst.toFixed(3),
      averageRippleCpuMs: +(rippleSum/count).toFixed(3), averageDrawCalls: +(totalCalls/count).toFixed(2),
      averagePasses: +(totalPasses/count).toFixed(2), worstPasses,
      averageGpuMs: gpuCount ? +(gpuSum/gpuCount).toFixed(3) : null, worstGpuMs: gpuCount ? +gpuWorst.toFixed(3) : null,
      gpuSamples: gpuCount, gpuScope, benchmarkMode, dpr: renderer.getPixelRatio(), css: `${renderer.domElement.clientWidth}x${renderer.domElement.clientHeight}`,
      lastFrameTriangles: triangles, resources: ripple.diagnostics,
      rendererResources: { textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries,
        programs: renderer.info.programs.length }, ripple: ripple.status }, null, 1);
  }
  function beginGpu(scope) {
    if (!active || performance.now() < warmUntil || !timer || gpuScope !== scope) return;
    const slot = queries[queryIndex]; queryIndex = (queryIndex+1)%queries.length;
    if (!slot.pending) { currentQuery = slot; slot.sample = true; gl.beginQuery(timer.TIME_ELAPSED_EXT, slot.query); }
  }
  function endGpu(scope) {
    if (gpuScope !== scope || !currentQuery) return;
    gl.endQuery(timer.TIME_ELAPSED_EXT); currentQuery.pending = true; currentQuery = null;
  }
  const profiler = {
    get controlsCamera() { return controlled && active; },
    updateCamera(camera, controls) {
      if (!controlled || !active) return;
      registerActivity();
      if (!orbitDistance) {
        orbitHeight = camera.position.y-controls.target.y;
        orbitDistance = Math.hypot(camera.position.x-controls.target.x, camera.position.z-controls.target.z);
      }
      const period = benchmarkMode === 'slow' ? Math.PI*35 : benchmarkMode === 'fast' ? 3 : 6;
      const yaw = Math.PI/180*35*(benchmarkMode === 'stationary' ? 1
        : Math.cos((performance.now()-start)/1000*Math.PI*2/period));
      camera.position.set(controls.target.x-Math.sin(yaw)*orbitDistance,
        controls.target.y+orbitHeight, controls.target.z+Math.cos(yaw)*orbitDistance);
      camera.lookAt(controls.target); camera.updateMatrixWorld();
    },
    beginFrame() {
      frameStart = performance.now(); calls = triangles = renderPasses = 0;
      pollGpu(); currentQuery = null;
      beginGpu('frame');
    },
    beginPhase: beginGpu,
    endPhase: endGpu,
    beginRipple() { rippleStart = performance.now(); beginGpu('ripple'); },
    endRipple() { endGpu('ripple'); if (active && performance.now() >= warmUntil) rippleSum += performance.now()-rippleStart; },
    endFrame() {
      endGpu('frame');
      if (!active) return;
      const now = performance.now(), cpu = now-frameStart;
      if (now < warmUntil) return;
      if (previousFrame) {
        const elapsed = frameStart-previousFrame;
        frames += 1; frameSum += elapsed; frameWorst = Math.max(frameWorst, elapsed);
        cpuSum += cpu; cpuWorst = Math.max(cpuWorst, cpu); totalCalls += calls; totalPasses += renderPasses;
        worstPasses = Math.max(worstPasses, renderPasses);
      }
      previousFrame = frameStart;
      if (now-start >= 12000) active = false;
      if (!active || now-lastUi >= 500) { lastUi = now; report(now); }
    },
  };
  ripple.setProfiler(profiler);
  return profiler;
}
