// 모든 검사 뒤에만 쓴다. Lua 실행 중 다른 요청이 끼어들 수 없다.
exports.ISSUE_LUA = `
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
for i=2,#KEYS do
  local n = tonumber(redis.call('GET',KEYS[i]) or '0')
  if not n or n < 0 or n ~= math.floor(n) then return 'invalid' end
  if n >= tonumber(ARGV[i+1]) then return 'cap' end
end
if redis.call('EXISTS',KEYS[1]) == 1 then return 'collision' end
redis.call('SET',KEYS[1],cjson.encode({expires=now+ttl*1000}), 'EX',ttl+86400)
for i=2,#KEYS do redis.call('INCR',KEYS[i]); redis.call('EXPIRE',KEYS[i],172800) end
return 'issued'
`;

exports.CLAIM_LUA = `
local now = tonumber(ARGV[1])
local raw = redis.call('GET',KEYS[1])
if not raw then return {'expired'} end
local t = cjson.decode(raw)
if t.expires <= now then return {'expired'} end
if t.code then
  if t.os ~= ARGV[2] or t.recipient ~= ARGV[3] or t.account ~= ARGV[7] then return {'taken'} end
  if t.codeExpires <= now then return {'expired'} end
  return {'again',t.code}
end
for i=5,#KEYS do if redis.call('EXISTS',KEYS[i]) == 1 then return {'recipient'} end end
local count = tonumber(redis.call('GET',KEYS[3]) or '0')
if not count or count < 0 or count ~= math.floor(count) then return {'invalid'} end
if count >= tonumber(ARGV[4]) then return {'cap'} end
local ledgerType = redis.call('TYPE',KEYS[4]).ok
if ledgerType ~= 'none' and ledgerType ~= 'hash' then return {'invalid'} end
local batches = redis.call('ZRANGEBYSCORE',KEYS[2],now+1,'+inf')
for _,batch in ipairs(batches) do
  local metaRaw = redis.call('GET',ARGV[6]..':batch:'..batch)
  if metaRaw then
    local m = cjson.decode(metaRaw)
    if m.os == ARGV[2] and m.expiresAt > now then
      local pool = ARGV[6]..':pool:'..ARGV[2]..':'..batch
      local code = redis.call('LINDEX',pool,0)
      if code then
        local valid = (ARGV[2]=='ios' and #code==18) or (ARGV[2]=='android' and #code==23)
        if not valid or string.find(code,'[^A-Z0-9]') then return {'invalid'} end
        t.code=code; t.codeExpires=m.expiresAt; t.os=ARGV[2]; t.recipient=ARGV[3]; t.account=ARGV[7]
        redis.call('LPOP',pool)
        redis.call('SET',KEYS[1],cjson.encode(t),'KEEPTTL')
        redis.call('INCR',KEYS[3]); redis.call('EXPIRE',KEYS[3],172800)
        for i=5,#KEYS do redis.call('SET',KEYS[i],'1','EX',34560000) end
        redis.call('HSET',KEYS[4],ARGV[5],cjson.encode({at=now,os=ARGV[2],tokenHash=ARGV[5],last4=string.sub(code,-4)}))
        return {'new',code}
      end
    end
  end
end
return {'empty'}
`;

// 재적재·같은 코드의 다른 묶음 편입을 먼저 전부 검사한다(오류 때 부분 적재 없음).
exports.LOAD_LUA = `
if redis.call('EXISTS',KEYS[1]) == 1 then return 'batch_exists' end
for i=2,4 do
  local kind=redis.call('TYPE',KEYS[i]).ok
  local expected=({'zset','list','set'})[i-1]
  if kind ~= 'none' and kind ~= expected then return 'invalid' end
end
for i=4,#ARGV do
  if redis.call('SISMEMBER',KEYS[4],ARGV[i]) == 1 then return 'duplicate' end
  if redis.call('SISMEMBER',KEYS[5],ARGV[i]) == 1 or redis.call('SISMEMBER',KEYS[6],ARGV[i]) == 1 or redis.call('HEXISTS',KEYS[7],ARGV[i]) == 1 then return 'overlap' end
end
redis.call('SET',KEYS[1],ARGV[1])
redis.call('ZADD',KEYS[2],ARGV[2],ARGV[3])
for i=4,#ARGV do redis.call('RPUSH',KEYS[3],ARGV[i]); redis.call('SADD',KEYS[4],ARGV[i]) end
return 'loaded'
`;

// 발송 전 두 수신 OS의 유효 재고·일 한도만 읽는다. 예약·차감·식별자 반환 없음.
exports.AVAILABLE_LUA = `
local now = tonumber(ARGV[1])
for i=1,2 do
  local os = ({'ios','android'})[i]
  local count = tonumber(redis.call('GET',KEYS[i+2]) or '0')
  if not count or count < 0 or count ~= math.floor(count) or count >= tonumber(ARGV[i+2]) then return 0 end
  local found = false
  local batches = redis.call('ZRANGEBYSCORE',KEYS[i],now+1,'+inf')
  for _,batch in ipairs(batches) do
    local raw = redis.call('GET',ARGV[2]..':batch:'..batch)
    if raw then
      local m = cjson.decode(raw)
      if m.os == os and m.expiresAt > now then
        local code = redis.call('LINDEX',ARGV[2]..':pool:'..os..':'..batch,0)
        if code then
          local valid = (os=='ios' and #code==18) or (os=='android' and #code==23)
          if valid and not string.find(code,'[^A-Z0-9]') then found = true; break end
        end
      end
    end
  end
  if not found then return 0 end
end
return 1
`;
