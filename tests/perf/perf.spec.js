import { expect, test } from '@playwright/test';

const currentPort = Number(process.env.ASCIIIFY_CURRENT_PORT || 5174);
const baselinePort = Number(process.env.ASCIIIFY_BASELINE_PORT || 5175);
const currentOrigin = `http://127.0.0.1:${currentPort}`;
const baselineOrigin = process.env.ASCIIIFY_BASELINE_DIR ? `http://127.0.0.1:${baselinePort}` : null;
const repeats = Number(process.env.ASCIIIFY_BENCH_REPEATS || 2);
const warmupMs = Number(process.env.ASCIIIFY_BENCH_WARMUP_MS || 1200);
const measureMs = Number(process.env.ASCIIIFY_BENCH_MEASURE_MS || 2200);

const scenarios = [
  'edge2d',
  'edge-layer',
  'same-grid-layers',
  'multilayer3d',
];

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

test('perf comparison against baseline', async ({ browser }, testInfo) => {
  const results = [];

  for (const scenario of scenarios) {
    const baseline = baselineOrigin
      ? await measureScenario(browser, baselineOrigin, scenario)
      : null;
    const current = await measureScenario(browser, currentOrigin, scenario);
    const ratio = baseline ? current.fps / baseline.fps : null;

    results.push({
      scenario,
      baseline,
      current,
      fpsDeltaPercent: ratio == null ? null : (ratio - 1) * 100,
      heapDeltaPercent: baseline?.heapUsed && current.heapUsed
        ? (current.heapUsed / baseline.heapUsed - 1) * 100
        : null,
    });

    expect(current.fps).toBeGreaterThan(0);
    if (baseline) {
      expect(current.fps).toBeGreaterThan(baseline.fps * 0.7);
    }
  }

  await testInfo.attach('perf-results.json', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });

  console.table(results.map((r) => ({
    scenario: r.scenario,
    baselineFps: r.baseline ? r.baseline.fps.toFixed(1) : 'n/a',
    currentFps: r.current.fps.toFixed(1),
    fpsDelta: r.fpsDeltaPercent == null ? 'n/a' : `${r.fpsDeltaPercent.toFixed(1)}%`,
    baselineHeapMB: r.baseline?.heapUsed ? bytesToMb(r.baseline.heapUsed).toFixed(1) : 'n/a',
    currentHeapMB: r.current.heapUsed ? bytesToMb(r.current.heapUsed).toFixed(1) : 'n/a',
  })));
});

async function measureScenario(browser, libOrigin, scenario) {
  const samples = [];
  for (let i = 0; i < repeats; i++) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
    try {
      const url = new URL('/tests/fixtures/perf-bench.html', currentOrigin);
      url.searchParams.set('scenario', scenario);
      url.searchParams.set('lib', `${libOrigin}/src/index.js`);
      url.searchParams.set('run', String(i));

      await page.goto(url.href);
      await page.waitForFunction(() => window.__benchReady === true && window.__frames > 5);
      await page.waitForTimeout(warmupMs);
      const start = await page.evaluate(() => ({ frames: window.__frames, time: performance.now() }));
      await page.waitForTimeout(measureMs);
      const end = await page.evaluate(() => ({
        frames: window.__frames,
        time: performance.now(),
        heapUsed: performance.memory?.usedJSHeapSize || null,
      }));
      samples.push({
        fps: (end.frames - start.frames) / ((end.time - start.time) / 1000),
        heapUsed: end.heapUsed,
      });
    } finally {
      await page.close();
    }
  }

  return {
    fps: median(samples.map((s) => s.fps)),
    heapUsed: median(samples.map((s) => s.heapUsed).filter(Boolean)) || null,
  };
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1];
}

function bytesToMb(value) {
  return value / 1024 / 1024;
}
