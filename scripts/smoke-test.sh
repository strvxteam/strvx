#!/usr/bin/env bash
# smoke-test.sh — end-to-end smoke for the brain stack.
#
# Hits every SIT KG surface, every MCP tool, plus gbrain :3131 /health.
# Exits non-zero on the first failure. Designed for both local dev runs
# and CI.
#
# Usage:
#   scripts/smoke-test.sh                     # localhost defaults
#   SIT_URL=https://internal.example.com \
#   GBRAIN_URL=http://localhost:3131 \
#     scripts/smoke-test.sh
set -uo pipefail

SIT_URL="${SIT_URL:-http://localhost:3010}"
GBRAIN_URL="${GBRAIN_URL:-http://localhost:3131}"

PASS=0
FAIL=0
declare -a FAILURES

check() {
  local name="$1"; shift
  local actual
  actual=$("$@" 2>&1)
  local rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "  ok   $name"
    PASS=$((PASS+1))
  else
    echo "  FAIL $name"
    echo "       $actual"
    FAIL=$((FAIL+1))
    FAILURES+=("$name")
  fi
}

expect_code() {
  local url="$1" expected="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$code" = "$expected" ]; then return 0; fi
  echo "expected $expected, got $code at $url"; return 1
}

expect_jsonrpc_ok() {
  local url="$1" payload="$2" jq_check="$3"
  local body
  body=$(curl -s -X POST "$url" \
    -H 'content-type: application/json' \
    -d "$payload")
  echo "$body" | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    if 'error' in r and r['error']:
        print('error:', r['error']); sys.exit(1)
    $jq_check
except Exception as e:
    print('parse error:', e, sys.stdin.read()[:200]); sys.exit(1)
" || return 1
}

echo "=== HTTP endpoints (SIT @ $SIT_URL) ==="
check "GET /kg → 200"                        expect_code "$SIT_URL/kg"                                          200
check "GET /kg/graph → 200"                  expect_code "$SIT_URL/kg/graph"                                    200
check "GET /kg/browse?label=Person → 200"    expect_code "$SIT_URL/kg/browse?label=Person"                      200
check "GET /kg/browse?label=Engagement → 200" expect_code "$SIT_URL/kg/browse?label=Engagement"                  200
check "GET /kg/entity/people/jane-doe → 200" expect_code "$SIT_URL/kg/entity/people%2Fjane-doe"                  200
check "GET /api/kg/health → 200"             expect_code "$SIT_URL/api/kg/health"                               200

echo ""
echo "=== gbrain (@ $GBRAIN_URL) ==="
check "GET /health → 200"                    expect_code "$GBRAIN_URL/health"                                   200

echo ""
echo "=== SIT MCP tools/list ==="
check "tools/list returns 6 tools" \
  expect_jsonrpc_ok "$SIT_URL/api/mcp" \
    '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
    "tools=r['result']['tools']; assert len(tools) >= 6, len(tools); names={t['name'] for t in tools}; required={'kg_search','kg_get_node','kg_get_entity_context','kg_recent','kg_open_threads','kg_list_by_type'}; assert required.issubset(names), required-names"

echo ""
echo "=== SIT MCP tool calls ==="
check "kg_search returns hits for 'Acme'" \
  expect_jsonrpc_ok "$SIT_URL/api/mcp" \
    '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"kg_search","arguments":{"query":"Acme","limit":3}}}' \
    "hits=json.loads(r['result']['content'][0]['text']); assert len(hits) > 0, hits"

check "kg_get_node returns a known page" \
  expect_jsonrpc_ok "$SIT_URL/api/mcp" \
    '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"kg_get_node","arguments":{"id":"deals/beta-test-project"}}}' \
    "node=json.loads(r['result']['content'][0]['text']); assert node and node['id'] == 'deals/beta-test-project', node"

check "kg_get_entity_context returns nodes+edges" \
  expect_jsonrpc_ok "$SIT_URL/api/mcp" \
    '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"kg_get_entity_context","arguments":{"id":"deals/beta-test-project","depth":2,"limit":20}}}' \
    "ctx=json.loads(r['result']['content'][0]['text']); assert ctx and len(ctx['nodes']) > 0, ctx"

check "kg_recent returns recent pages" \
  expect_jsonrpc_ok "$SIT_URL/api/mcp" \
    '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"kg_recent","arguments":{"days":30,"limit":5}}}' \
    "out=json.loads(r['result']['content'][0]['text']); assert isinstance(out, list), out"

check "kg_open_threads returns threads" \
  expect_jsonrpc_ok "$SIT_URL/api/mcp" \
    '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"kg_open_threads","arguments":{"limit":5}}}' \
    "out=json.loads(r['result']['content'][0]['text']); assert isinstance(out, list), out"

echo ""
echo "=== summary ==="
echo "  $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo "  failures:"
  for f in "${FAILURES[@]}"; do echo "    - $f"; done
  exit 1
fi
echo "  ✅ all green"
