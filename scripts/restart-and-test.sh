#!/usr/bin/env bash
# SiteFlow dev helper: restart the production server against the current build
# and run an end-to-end smoke test of the Nepal features (BOQ, inventory,
# purchase/sales orders, reports, letterhead print).
set -u
C="curl -s --max-time 20"

echo "== stopping old server =="
pkill -f 'next-server' 2>/dev/null && echo "killed next-server" || echo "no next-server"
pkill -f 'next start' 2>/dev/null
sleep 2

echo "== starting fresh =="
rm -f /tmp/siteflow.log
setsid nohup npm run start > /tmp/siteflow.log 2>&1 < /dev/null &
for i in $(seq 1 30); do $C -o /dev/null http://localhost:3000/login && break; sleep 1; done
echo "server ready (waited ${i}s)"

echo "== login manager =="
$C -c /tmp/m.jar http://localhost:3000/api/auth/csrf > /dev/null
CSRF=$($C -b /tmp/m.jar -c /tmp/m.jar http://localhost:3000/api/auth/csrf | sed 's/.*"csrfToken":"\([^"]*\)".*/\1/')
$C -b /tmp/m.jar -c /tmp/m.jar -X POST http://localhost:3000/api/auth/callback/credentials \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=manager@siteflow.com&password=password123&csrfToken=$CSRF&json=true" -o /dev/null

echo "== 1. purchase CSV (contains BS dates) =="
$C -b /tmp/m.jar "http://localhost:3000/api/reports/export?type=purchase" | head -2

echo "== 2. inventory seeded =="
$C -b /tmp/m.jar http://localhost:3000/api/inventory | python3 -c "
import sys,json
d=json.load(sys.stdin)['items']
print('items:', len(d), '| e.g.', d[0]['name'], d[0]['stockQty'], d[0]['unit'], 'Rs.', d[0]['lastPrice'])"

echo "== 3. BOQ seeded with totals =="
$C -b /tmp/m.jar http://localhost:3000/api/boq | python3 -c "
import sys,json
b=json.load(sys.stdin)['boqs'][0]
print(b['ref'], '| total Rs.', b['totals']['total'], '| items:', len(b['items']))"

echo "== 4. create inventory item =="
$C -b /tmp/m.jar -X POST http://localhost:3000/api/inventory -H "Content-Type: application/json" \
  -d '{"code":"WIR-BND-18","name":"Binding Wire 18g","category":"Steel","unit":"kg","stockQty":500,"minStock":100,"lastPrice":145}' \
  | python3 -c "import sys,json; i=json.load(sys.stdin)['item']; print('created:', i['code'])"

echo "== 5. price update (market fluctuation) =="
IID=$($C -b /tmp/m.jar http://localhost:3000/api/inventory | python3 -c "import sys,json; print([i for i in json.load(sys.stdin)['items'] if i['code']=='WIR-BND-18'][0]['id'])")
$C -b /tmp/m.jar -X PATCH http://localhost:3000/api/inventory/$IID -H "Content-Type: application/json" -d '{"lastPrice":152}' \
  | python3 -c "import sys,json; print('price updated to Rs.', json.load(sys.stdin)['item']['lastPrice'])"

echo "== 6. create PO (NPR, 13% VAT) =="
CEM=$($C -b /tmp/m.jar http://localhost:3000/api/inventory | python3 -c "import sys,json; print([i for i in json.load(sys.stdin)['items'] if i['code']=='CEM-OPC-50'][0]['id'])")
SITE_ID=$($C -b /tmp/m.jar http://localhost:3000/api/sites | python3 -c "import sys,json; print(json.load(sys.stdin)['sites'][0]['id'])")
$C -b /tmp/m.jar -X POST http://localhost:3000/api/purchase-orders -H "Content-Type: application/json" \
  -d "{\"vendorName\":\"Test Vendor Nepal\",\"vendorVat\":\"301111111\",\"siteId\":\"$SITE_ID\",\"taxPercent\":13,\"currency\":\"NPR\",\"items\":[{\"inventoryId\":\"$CEM\",\"description\":\"Cement OPC 53 Grade\",\"unit\":\"bag\",\"qty\":100,\"unitPrice\":860}]}" \
  | python3 -c "import sys,json; o=json.load(sys.stdin)['order']; print('created:', o['number'], '| total Rs.', o['totals']['total'])"
PO_ID=$($C -b /tmp/m.jar http://localhost:3000/api/purchase-orders | python3 -c "import sys,json; print([o for o in json.load(sys.stdin)['orders'] if o['vendorName']=='Test Vendor Nepal'][0]['id'])")

echo "== 7. approve + receive (stock-in) =="
$C -b /tmp/m.jar -X PATCH http://localhost:3000/api/purchase-orders/$PO_ID -H "Content-Type: application/json" -d '{"status":"APPROVED"}' > /dev/null
BEFORE=$($C -b /tmp/m.jar http://localhost:3000/api/inventory | python3 -c "import sys,json; print([i for i in json.load(sys.stdin)['items'] if i['code']=='CEM-OPC-50'][0]['stockQty'])")
$C -b /tmp/m.jar -X PATCH http://localhost:3000/api/purchase-orders/$PO_ID -H "Content-Type: application/json" -d '{"receiveAll":true}' \
  | python3 -c "import sys,json; print('receive status:', json.load(sys.stdin)['order']['status'])"
AFTER=$($C -b /tmp/m.jar http://localhost:3000/api/inventory | python3 -c "import sys,json; print([i for i in json.load(sys.stdin)['items'] if i['code']=='CEM-OPC-50'][0]['stockQty'])")
echo "cement stock: $BEFORE -> $AFTER (expect +100)"

echo "== 8. PO letterhead print =="
$C -o /dev/null -w "PO print: %{http_code} %{content_type}\n" -b /tmp/m.jar http://localhost:3000/api/purchase-orders/$PO_ID/print

echo "== 9. reports =="
$C -b /tmp/m.jar http://localhost:3000/api/reports/sales | python3 -c "import sys,json; d=json.load(sys.stdin); print('sales revenue Rs.', d['totalRevenue'])"
$C -b /tmp/m.jar http://localhost:3000/api/reports/purchase | python3 -c "import sys,json; d=json.load(sys.stdin); print('purchase spend Rs.', d['totalSpend'])"

echo "== 10. new pages render =="
for p in /portal/boq /portal/inventory /portal/purchase-orders /portal/sales-orders; do
  code=$($C -o /dev/null -w "%{http_code}" -b /tmp/m.jar http://localhost:3000$p)
  echo "$p -> $code"
done

echo "ALL NEPAL FEATURE TESTS DONE"
