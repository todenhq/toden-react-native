import { PromptTimeline } from '../liveness/promptTimeline';

describe('PromptTimeline', () => {
  it('reports the head directions too, which it once left out', () => {
    const t = new PromptTimeline();
    for (const [i, prompt] of ['turnRight', 'turnLeft', 'lookDown', 'lookUp'].entries()) {
      t.shown(prompt, 2000 + i * 3000);
      t.passed(3000 + i * 3000);
    }
    expect(t.report(1000)?.map((p) => p.prompt)).toEqual(['turnRight', 'turnLeft', 'lookDown', 'lookUp']);
  });

  it('reports each prompt against the start of the recording', () => {
    const t = new PromptTimeline();
    t.shown('turn', 2000);
    t.passed(3400);
    t.shown('smile', 5100);
    t.passed(6200);
    expect(t.report(1000)).toEqual([
      { prompt: 'turn', shownAt: 1000, passedAt: 2400 },
      { prompt: 'smile', shownAt: 4100, passedAt: 5200 },
    ]);
  });

  it('keeps the first time when a prompt is shown again', () => {
    const t = new PromptTimeline();
    t.shown('blink', 1000);
    t.shown('blink', 4000);
    t.passed(5000);
    expect(t.report(0)).toEqual([{ prompt: 'blink', shownAt: 1000, passedAt: 5000 }]);
  });

  it('leaves out the flash, the passive hold and a prompt that never passed', () => {
    const t = new PromptTimeline();
    t.shown('flash', 100);
    t.shown('hold', 200);
    t.passed(300);
    expect(t.report(0)).toBeUndefined();
    t.shown('turn', 400);
    expect(t.report(0)).toBeUndefined();
  });

  it('counts a prompt shown before the recorder went live from the first frame', () => {
    const t = new PromptTimeline();
    t.shown('turn', 900);
    t.passed(2000);
    expect(t.report(1000)).toEqual([{ prompt: 'turn', shownAt: 0, passedAt: 1000 }]);
  });

  it('reports nothing with no recording, and nothing after a retry', () => {
    const t = new PromptTimeline();
    t.shown('turn', 100);
    t.passed(200);
    expect(t.report(null)).toBeUndefined();
    t.reset();
    expect(t.report(0)).toBeUndefined();
  });
});
