import assert from 'node:assert/strict';
import { orphanNumberReasons } from '../src/lib/ai/claimChecks';
// 실모델 10/23 23:3x REG: 뉴스 «consumer sentiment holds at 48» 를 옮긴 정상 문장이 orphan-number:48 로 탈락(4/27)
assert.deepEqual(orphanNumberReasons('A 10/23 10:17 ET report showed U.S. consumer sentiment holding steady at 48 while inflation expectations rose.'), []);
assert.deepEqual(orphanNumberReasons('10/23(금) 10:17 ET 보도에 따르면 미국 소비자 심리가 48로 유지됐습니다.'), []);
assert.deepEqual(orphanNumberReasons('10/23(金) 10:17 ET報道によると、米国の消費者心理が48で保ち合いました。'), []);
// 주어 없는 숫자는 여전히 탈락
assert.ok(orphanNumberReasons('이는 48 수준입니다.').length > 0);
console.log('통과 경제 지표 수준 주어(심리·sentiment·心理)');
