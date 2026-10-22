/**
 * 앱 하단 탭 라벨 — ko 만 한글, en·ja 는 영어 고정 그대로(2026-10-22 대표 지시).
 * 실행: npx tsx tests/appBottomNavLabels.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  bottomNavLabel, BOTTOM_NAV_EN_LABELS, BOTTOM_NAV_KO_LABELS, type BottomNavTabId,
} from '../src/lib/app/bottomNavLabels';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const IDS: BottomNavTabId[] = ['dash', 'guardian', 'cmd', 'flow', 'intel'];
// 변경 전(6/29~10/22) 화면에 나가던 값 — en·ja 는 이 바이트 그대로여야 한다.
const BEFORE = ['Dashboard', 'Guardian', 'Command', 'Flow', 'Intel'];

t('en·ja 는 변경 전과 바이트 동일', () => {
  for (const loc of ['en', 'ja']) {
    assert.deepEqual(IDS.map((id) => bottomNavLabel(id, loc)), BEFORE, loc);
  }
});

t('ko 는 한글 라벨', () => {
  assert.deepEqual(IDS.map((id) => bottomNavLabel(id, 'ko')), ['대시보드', '가디언', '커맨드', '플로우', '섹터 인텔']);
  for (const id of IDS) assert.match(BOTTOM_NAV_KO_LABELS[id], /^[가-힣 ]+$/, id);
});

t('ko 라벨은 5글자 이하(탭 폭 안 — 글꼴 축소 없이)', () => {
  for (const id of IDS) assert.ok([...BOTTOM_NAV_KO_LABELS[id]].length <= 5, id);
});

t('ko 외·알 수 없는 로케일은 영어(기존 동작)', () => {
  for (const loc of ['', undefined, null, 'zh', 'KO', 'ko-KR']) {
    assert.deepEqual(IDS.map((id) => bottomNavLabel(id, loc as string)), BEFORE, String(loc));
  }
});

t('컴포넌트 TABS 의 영어 라벨·순서가 영어 표와 일치하고 라벨은 bottomNavLabel 로만 나간다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/components/app/AppBottomNav.tsx'), 'utf8');
  const tabs = [...src.matchAll(/\{ id: '(\w+)', label: '([^']+)'/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(tabs, IDS.map((id) => [id, BOTTOM_NAV_EN_LABELS[id]]));
  assert.match(src, /const label = bottomNavLabel\(tab\.id, locale\);/);
  assert.match(src, /const locale = useLocale\(\);/);
});

console.log(`appBottomNavLabels: ${n} passed`);
