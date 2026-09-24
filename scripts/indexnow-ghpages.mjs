#!/usr/bin/env node
/* ============================================================================
 * indexnow-ghpages — GitHub Pages 데이터셋 사이트(options-market-structure-daily)의 페이지를
 * IndexNow(Bing·Naver·Yandex·Seznam·Yep)에 즉시 통보한다.
 *
 * ★2026-09-23 확장: 우리 도메인(signumhq.com)은 scripts/indexnow-submit.js 가 맡는다. 이 사이트는
 *   «프로젝트 폴더»라 호스트 루트에 키를 못 두지만, IndexNow 는 keyLocation 을 하위 폴더에 두면
 *   «그 폴더 안의 URL»을 통보할 수 있다. 키 파일은 저장소 루트(= 이 폴더)에 올려 두었다(9/23, 202 Accepted).
 *   IndexNow 키는 공개가 전제인 값이다(비밀이 아니다).
 * 사용: node scripts/indexnow-ghpages.mjs [members.json 경로=/tmp/ego/gh/members.json]
 *   주간 갱신(congress-dataset.mjs → github-upload.mjs) 뒤에 돌린다.
 * ========================================================================== */
import { readFileSync, existsSync } from 'node:fs';
const KEY = 'cf002e9d2c3f3d071dd811dc2a9c25d4';
const B = 'https://myjr0629-hue.github.io/options-market-structure-daily';
const mp = process.argv[2] || '/tmp/ego/gh/members.json';
const members = existsSync(mp) ? JSON.parse(readFileSync(mp, 'utf8')) : [];
const urlList = [B + '/', B + '/congress.html', B + '/finra-short-volume.html', ...members.map((m) => B + '/' + m.slug)];
const k = await fetch(B + '/' + KEY + '.txt').then((r) => r.text()).catch(() => '');
if (k.trim() !== KEY) { console.error('⛔ 키 파일이 사이트에 없다 — 먼저 저장소 루트에 ' + KEY + '.txt 를 올릴 것'); process.exit(1); }
const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: 'myjr0629-hue.github.io', key: KEY, keyLocation: B + '/' + KEY + '.txt', urlList }) });
console.log('IndexNow', r.status, urlList.length + '개 URL', r.status === 200 || r.status === 202 ? '✅ 접수' : '⛔');
