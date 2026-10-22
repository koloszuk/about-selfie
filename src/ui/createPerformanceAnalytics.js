import * as THREE from 'three';

export const PERFORMANCE_ANALYTICS_ENABLED = true;

const UI_REFRESH_MS = 500;
const SAMPLE_WINDOW_SECONDS = 3;
const SAMPLE_CAPACITY = 512;

export function createPerformanceAnalytics(parent, { renderer, deformer, controls, asset }) {
  if (!PERFORMANCE_ANALYTICS_ENABLED || !parent) return createDisabledAnalytics();

  const panel = document.createElement('aside');
  panel.className = 'advanced-tool performance-analytics';
  panel.innerHTML = `
    <div class="performance-analytics-content">
      <label><input type="checkbox" data-performance-detailed> Detailed timings</label>
      <small data-performance-frame></small>
      <small data-performance-renderer></small>
      <small data-performance-asset></small>
      <small data-performance-cpu></small>
      <small data-performance-workload></small>
    </div>
  `;
  parent.appendChild(panel);

  const detailedInput = panel.querySelector('[data-performance-detailed]');
  const frameText = panel.querySelector('[data-performance-frame]');
  const rendererText = panel.querySelector('[data-performance-renderer]');
  const assetText = panel.querySelector('[data-performance-asset]');
  const cpuText = panel.querySelector('[data-performance-cpu]');
  const workloadText = panel.querySelector('[data-performance-workload]');
  const frameSamples = new Float32Array(SAMPLE_CAPACITY);
  const sampleTimes = new Float64Array(SAMPLE_CAPACITY);
  const handleSamples = new Float32Array(SAMPLE_CAPACITY);
  const handleSampleTimes = new Float64Array(SAMPLE_CAPACITY);
  const rendererSize = new THREE.Vector2();
  let sampleReadIndex = 0;
  let sampleWriteIndex = 0;
  let sampleCount = 0;
  let frameSum = 0;
  let handleSampleReadIndex = 0;
  let handleSampleWriteIndex = 0;
  let handleSampleCount = 0;
  let handleSampleSum = 0;
  let frameStart = 0;
  let lastUiUpdate = 0;
  let detailedTimings = false;
  let wiggleMs = 0;
  let springMs = 0;
  let vertexMs = 0;
  let normalMs = 0;
  let handlesMs = 0;
  let renderMs = 0;

  detailedInput.addEventListener('change', () => {
    detailedTimings = detailedInput.checked;
    deformer.setPerformanceTimingEnabled(detailedTimings);
    handleSampleReadIndex = 0;
    handleSampleWriteIndex = 0;
    handleSampleCount = 0;
    handleSampleSum = 0;
  });

  function beginFrame() {
    frameStart = performance.now();
    wiggleMs = 0;
    springMs = 0;
    vertexMs = 0;
    normalMs = 0;
    handlesMs = 0;
    renderMs = 0;
  }

  function record(name, duration) {
    if (!detailedTimings) return;
    if (name === 'wiggle') wiggleMs += duration;
    else if (name === 'spring') springMs += duration;
    else if (name === 'vertex') vertexMs += duration;
    else if (name === 'handles') handlesMs += duration;
  }

  function recordRender(duration) {
    renderMs = duration;
  }

  function endFrame(frameDeltaSeconds) {
    const totalMs = performance.now() - frameStart;
    const frameMs = frameDeltaSeconds * 1000;
    const now = performance.now();
    const windowMs = SAMPLE_WINDOW_SECONDS * 1000;
    while (sampleCount > 0 && now - sampleTimes[sampleReadIndex] > windowMs) {
      frameSum -= frameSamples[sampleReadIndex];
      sampleReadIndex = (sampleReadIndex + 1) % SAMPLE_CAPACITY;
      sampleCount -= 1;
    }
    if (sampleCount === SAMPLE_CAPACITY) {
      frameSum -= frameSamples[sampleReadIndex];
      sampleReadIndex = (sampleReadIndex + 1) % SAMPLE_CAPACITY;
      sampleCount -= 1;
    }
    frameSamples[sampleWriteIndex] = frameMs;
    sampleTimes[sampleWriteIndex] = now;
    frameSum += frameMs;
    sampleWriteIndex = (sampleWriteIndex + 1) % SAMPLE_CAPACITY;
    sampleCount += 1;

    if (detailedTimings) {
      const stats = deformer.getFrameStats();
      vertexMs += stats.vertexUpdateMs;
      normalMs += stats.normalMs;
      recordHandleSample(now, handlesMs);
    }

    if (now - lastUiUpdate >= UI_REFRESH_MS) {
      lastUiUpdate = now;
      refreshUi(frameMs, totalMs);
    }
  }

  function refreshUi(currentFrameMs, currentTotalMs) {
    if (!sampleCount) return;
    let worstFrameMs = 0;
    for (let offset = 0; offset < sampleCount; offset += 1) {
      const index = (sampleReadIndex + offset) % SAMPLE_CAPACITY;
      worstFrameMs = Math.max(worstFrameMs, frameSamples[index]);
    }
    const averageFrameMs = frameSum / sampleCount;
    const averageFps = averageFrameMs > 0 ? 1000 / averageFrameMs : 0;
    const currentFps = currentFrameMs > 0 ? 1000 / currentFrameMs : 0;
    const averageHandlesMs = handleSampleCount > 0
      ? handleSampleSum / handleSampleCount
      : 0;
    const cssWidth = renderer.domElement.clientWidth;
    const cssHeight = renderer.domElement.clientHeight;
    renderer.getDrawingBufferSize(rendererSize);
    const renderInfo = renderer.info.render;
    const controlStats = controls.getPerformanceStats();
    const assetTextValue = asset?.transferSize > 0
      ? `${(asset.transferSize / (1024 * 1024)).toFixed(2)} MB · ${asset.durationMs.toFixed(0)} ms`
      : `cached / unavailable · ${asset?.durationMs?.toFixed(0) ?? '—'} ms`;

    frameText.textContent = `Frame: ${currentFps.toFixed(0)} FPS · avg ${averageFps.toFixed(0)} FPS · ` +
      `avg ${averageFrameMs.toFixed(1)} ms · worst ${worstFrameMs.toFixed(1)} ms (${SAMPLE_WINDOW_SECONDS}s)`;
    rendererText.textContent = `Renderer: ${renderInfo.calls} calls · ${renderInfo.triangles.toLocaleString()} triangles · ` +
      `DPR ${renderer.getPixelRatio().toFixed(2)} · CSS ${cssWidth}×${cssHeight} · ` +
      `internal ${rendererSize.x}×${rendererSize.y}`;
    assetText.textContent = `Asset: head.glb ${assetTextValue}`;
    cpuText.textContent = detailedTimings
      ? `CPU: Wiggle ${wiggleMs.toFixed(2)} · Spring ${springMs.toFixed(2)} · Vertex ${vertexMs.toFixed(2)} · ` +
        `Normals ${normalMs.toFixed(2)} · Handles ${handlesMs.toFixed(2)} (avg ${averageHandlesMs.toFixed(2)}) · ` +
        `Render ${renderMs.toFixed(2)} · ` +
        `Total ${currentTotalMs.toFixed(2)} ms`
      : `CPU: Render ${renderMs.toFixed(2)} ms · Total ${currentTotalMs.toFixed(2)} ms (enable Detailed timings for systems)`;
    workloadText.textContent = `Workload: ${controlStats.totalControls} controls · ${controlStats.activeWiggleControls} Wiggle · ` +
      `${controlStats.activeManualControls} held/returning · positions ${deformer.getFrameStats().positionsUpdated ? 'updated' : 'unchanged'} · ` +
      `normals ${deformer.getFrameStats().normalsRecomputed ? 'recomputed' : 'unchanged'} · ` +
      `${controlStats.handlesInsideVisibilityRadius}/${controlStats.totalControls} handles nearby · ` +
      `${controlStats.occlusionRaysThisFrame} occlusion rays` +
      `${controlStats.forceMarkersVisible ? ' · force-visible debug (not representative)' : ''}`;
  }

  function recordHandleSample(now, value) {
    const windowMs = SAMPLE_WINDOW_SECONDS * 1000;
    while (
      handleSampleCount > 0 &&
      now - handleSampleTimes[handleSampleReadIndex] > windowMs
    ) {
      handleSampleSum -= handleSamples[handleSampleReadIndex];
      handleSampleReadIndex = (handleSampleReadIndex + 1) % SAMPLE_CAPACITY;
      handleSampleCount -= 1;
    }
    if (handleSampleCount === SAMPLE_CAPACITY) {
      handleSampleSum -= handleSamples[handleSampleReadIndex];
      handleSampleReadIndex = (handleSampleReadIndex + 1) % SAMPLE_CAPACITY;
      handleSampleCount -= 1;
    }
    handleSamples[handleSampleWriteIndex] = value;
    handleSampleTimes[handleSampleWriteIndex] = now;
    handleSampleSum += value;
    handleSampleWriteIndex = (handleSampleWriteIndex + 1) % SAMPLE_CAPACITY;
    handleSampleCount += 1;
  }

  return {
    enabled: true,
    get detailedTimings() { return detailedTimings; },
    beginFrame,
    record,
    recordRender,
    endFrame,
  };
}

function createDisabledAnalytics() {
  return {
    enabled: false,
    detailedTimings: false,
    beginFrame() {},
    record() {},
    recordRender() {},
    endFrame() {},
  };
}
