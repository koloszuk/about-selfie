export function createDepthOfFieldControl(parent, dof) {
  const fields=[['strength','Blur Strength',0,1,.01,''],['blurStart','Focus Depth / Blur Start',0,1,.01,''],
    ['softness','Focus Transition Softness',.05,1,.01,''],['maxRadius','Maximum Blur Radius',0,8,.1,'reference CSS px']];
  const panel=document.createElement('div');panel.className='advanced-tool';
  panel.innerHTML=`<label class="follow-toggle"><span>Enabled</span><input type="checkbox" aria-label="Enable Depth of Field"><span class="toggle-track"><span class="toggle-thumb"></span></span></label>
    <fieldset class="squinting-group"><legend>Rear character depth</legend>${fields.map(([key,label,min,max,step,unit])=>`<label><span>${label}</span><input type="range" data-dof="${key}" aria-label="${label}" min="${min}" max="${max}" step="${step}"><output data-dof-value="${key}"></output><small>${unit}</small></label>`).join('')}</fieldset>
    <small>Opt-in: adds a character color target, half-resolution alpha-depth pass and composite. Front depth stays sharp. Unsupported fine-fringe depth stays sharp to avoid halos. FXAA mode bypasses DOF.</small>`;
  const enabled=panel.querySelector('input[type=checkbox]');enabled.checked=dof.config.enabled;
  enabled.addEventListener('change',()=>{dof.config.enabled=enabled.checked;});
  for(const input of panel.querySelectorAll('[data-dof]')) {
    const key=input.dataset.dof,out=panel.querySelector(`[data-dof-value="${key}"]`);
    input.value=dof.config[key];out.value=input.value;
    input.addEventListener('input',()=>{dof.config[key]=Number(input.value);out.value=input.value;});
  }
  parent.appendChild(panel);
}
