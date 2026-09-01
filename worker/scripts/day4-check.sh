#!/bin/bash
set -e
BASE="${1:-http://127.0.0.1:8787}"
CURL="curl -s"
if [[ "$BASE" == https://* ]]; then CURL="curl -s --ssl-no-revoke"; fi
jget() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j$1)})"; }

echo "=== create a fresh personal application to attach fake-it panels to ==="
START=$($CURL -X POST $BASE/api/applications/start -H "Content-Type: application/json" -d '{"customerId":9101,"customerEmail":"day4@example.com"}')
REF=$(echo "$START" | jget ".applicationRef")
echo "ref=$REF"

$CURL -X PUT "$BASE/api/applications/$REF/section" -H "Content-Type: application/json" -d '{"section":"personalDetails","data":{"firstName":"Dana","lastName":"Cohen","dateOfBirth":"1985-03-10","nationalId":"301234567","street":"5 Herzl Street","city":"Haifa"}}' > /dev/null
$CURL -X PUT "$BASE/api/applications/$REF/section" -H "Content-Type: application/json" -d '{"section":"incomeEmployment","data":{"employmentStatus":"Employed","employer":"Wix.com","monthlyGrossIncome":18000}}' > /dev/null
$CURL -X PUT "$BASE/api/applications/$REF/section" -H "Content-Type: application/json" -d '{"section":"creditDeclarations","data":{"hasDefaulted":false,"hasBankruptcy":false,"hasCCJ":false,"creditScore":720}}' > /dev/null

echo "=== Data Verification: generate (should be stable across repeat calls) ==="
DV1=$($CURL "$BASE/api/applications/$REF/data-verification")
echo "$DV1" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('rules:',j.rules.length);j.rules.forEach(r=>console.log(' -',r.ruleKey,r.status,'app:',r.applicationValue,'doc:',r.documentValue,'3rd:',r.thirdPartyValue))})"
DV2=$($CURL "$BASE/api/applications/$REF/data-verification")
STABLE=$(node -e "console.log(JSON.stringify($DV1)===JSON.stringify($DV2))" 2>/dev/null || echo "check-manually")
echo "stable across repeat calls: $STABLE"

echo "=== Data Verification: resolve a rule (find first non-GREEN) ==="
RULEKEY=$(echo "$DV1" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const r=j.rules.find(x=>x.status!=='GREEN');console.log(r?r.ruleKey:'')})")
if [ -n "$RULEKEY" ]; then
  RESOLVED=$($CURL -X POST "$BASE/api/applications/$REF/data-verification/resolve" -H "Content-Type: application/json" -d "{\"ruleKey\":\"$RULEKEY\",\"action\":\"APPROVE_EXCEPTION\",\"note\":\"Verified by phone\",\"reviewedBy\":\"underwriter@digibank.com\"}")
  echo "resolved $RULEKEY -> $(echo "$RESOLVED" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const r=j.rules.find(x=>x.ruleKey==='$RULEKEY');console.log(JSON.stringify(r.resolution))})")"
  echo "status unchanged (still $(echo "$RESOLVED" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const r=j.rules.find(x=>x.ruleKey==='$RULEKEY');console.log(r.status)})"))"
else
  echo "(all rules happened to roll GREEN this time — skipping resolve test)"
fi

echo "=== Data Verification: reject exception without note (should 400) ==="
$CURL -o /dev/null -w "http_code=%{http_code}\n" -X POST "$BASE/api/applications/$REF/data-verification/resolve" -H "Content-Type: application/json" -d '{"ruleKey":"fullName","action":"APPROVE_EXCEPTION","reviewedBy":"x"}'

echo "=== Business Financials Analysis (business application) ==="
BSTART=$($CURL -X POST $BASE/api/applications/start-business -H "Content-Type: application/json" -d '{"customerId":9102,"customerEmail":"day4biz@example.com"}')
BREF=$(echo "$BSTART" | jget ".applicationRef")
$CURL -X PUT "$BASE/api/applications/$BREF/section" -H "Content-Type: application/json" -d '{"section":"businessFinancials","data":{"monthlyRevenue":150000,"annualTurnover":1800000}}' > /dev/null
$CURL -X PUT "$BASE/api/applications/$BREF/section" -H "Content-Type: application/json" -d '{"section":"businessCreditDeclarations","data":{"directorCreditScore":75}}' > /dev/null
BFA=$($CURL "$BASE/api/applications/$BREF/business-financials-analysis")
echo "$BFA"
echo "riskGrade=$(echo "$BFA" | jget '.riskGrade')"

echo "=== notifications: list, unread count, mark-read ==="
$CURL "$BASE/api/notifications/customer/9101" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('count:',j.length)})"
$CURL -X POST "$BASE/api/notifications/customer/9101/seed-welcome" > /dev/null
$CURL "$BASE/api/notifications/customer/9101/unread-count"
echo
NOTIF=$($CURL "$BASE/api/notifications/customer/9101")
NID=$(echo "$NOTIF" | jget "[0].id")
$CURL -X PUT "$BASE/api/notifications/$NID/read" -o /dev/null -w "mark-read http_code=%{http_code}\n"
$CURL "$BASE/api/notifications/customer/9101/unread-count"
echo
$CURL -X PUT "$BASE/api/notifications/customer/9101/read-all" -o /dev/null -w "read-all http_code=%{http_code}\n"
$CURL "$BASE/api/notifications/customer/9101/unread-count"
echo

echo "=== documents: should fail cleanly with 503 (R2 not yet enabled) ==="
$CURL -w "\nhttp_code=%{http_code}\n" -X POST "$BASE/api/documents/generate" -H "Content-Type: application/json" -d "{\"applicationRef\":\"$REF\",\"customerId\":9101,\"documentType\":\"APPROVAL_LETTER\",\"customerName\":\"Dana Cohen\",\"loanAmount\":20000,\"productName\":\"Standard Personal Loan\",\"interestRate\":5.5,\"termMonths\":36,\"monthlyRepayment\":650}"

echo "=== ALL DAY 4 CHECKS COMPLETE ==="
