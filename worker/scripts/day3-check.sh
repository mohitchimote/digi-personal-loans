#!/bin/bash
set -e
BASE="${1:-http://127.0.0.1:8787}"
CURL="curl -s"
if [[ "$BASE" == https://* ]]; then CURL="curl -s --ssl-no-revoke"; fi
jget() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j$1)})"; }

echo "=== personal affordability: should PASS ==="
PASS=$($CURL -X POST $BASE/api/affordability/check -H "Content-Type: application/json" -d '{
  "monthlyGrossIncome": 20000, "monthlyNetIncome": 16000,
  "monthlyRent": 3000, "monthlyMortgage": 0, "monthlyLoans": 500,
  "creditCardPayments": 300, "otherMonthlyCommitments": 0, "monthlyLivingExpenses": 3000,
  "requestedLoanAmount": 20000, "requestedTermMonths": 36, "creditScore": 8
}')
echo "$PASS"
echo "passed=$(echo "$PASS" | jget '.passed')"

echo "=== personal affordability: should FAIL (bankruptcy hard stop) ==="
FAIL=$($CURL -X POST $BASE/api/affordability/check -H "Content-Type: application/json" -d '{
  "monthlyGrossIncome": 20000, "monthlyNetIncome": 16000,
  "requestedLoanAmount": 20000, "requestedTermMonths": 36, "creditScore": 8, "hasBankruptcy": true
}')
echo "passed=$(echo "$FAIL" | jget '.passed') reasons=$(echo "$FAIL" | jget '.failureReasons')"

echo "=== personal affordability: should FAIL (low income) ==="
FAIL2=$($CURL -X POST $BASE/api/affordability/check -H "Content-Type: application/json" -d '{
  "monthlyGrossIncome": 5000, "monthlyNetIncome": 4000,
  "requestedLoanAmount": 20000, "requestedTermMonths": 36, "creditScore": 8
}')
echo "passed=$(echo "$FAIL2" | jget '.passed') reasons=$(echo "$FAIL2" | jget '.failureReasons')"

echo "=== business DSCR: should PASS ==="
BPASS=$($CURL -X POST $BASE/api/affordability/check-business -H "Content-Type: application/json" -d '{
  "annualTurnover": 2400000, "monthlyRevenue": 200000, "monthlyOutgoings": 120000,
  "existingBusinessDebtService": 5000,
  "requestedLoanAmount": 200000, "requestedTermMonths": 36, "directorCreditScore": 8
}')
echo "$BPASS"
echo "passed=$(echo "$BPASS" | jget '.passed') dscr=$(echo "$BPASS" | jget '.dscr')"

echo "=== business DSCR: should FAIL (liquidation hard stop) ==="
BFAIL=$($CURL -X POST $BASE/api/affordability/check-business -H "Content-Type: application/json" -d '{
  "annualTurnover": 2400000, "monthlyRevenue": 200000,
  "requestedLoanAmount": 200000, "requestedTermMonths": 36, "directorCreditScore": 8,
  "hasLiquidationOrWindingUp": true
}')
echo "passed=$(echo "$BFAIL" | jget '.passed') reasons=$(echo "$BFAIL" | jget '.failureReasons')"

echo "=== affordability rules GET/PUT round trip ==="
$CURL $BASE/api/affordability/rules
echo
$CURL -X PUT $BASE/api/affordability/rules -H "Content-Type: application/json" -d '{
  "maxDti":45,"maxHti":35,"minMonthlyIncome":8000,"baseAnnualRate":0.06,
  "repaymentCapacityFactor":0.4,"minCreditScore":5,
  "autoApprovalThresholdSingle":30000,"autoApprovalThresholdJoint":50000
}'
echo

echo "=== eligible products (personal, mid-range profile) ==="
ELIG=$($CURL -X POST $BASE/api/products/eligible -H "Content-Type: application/json" -d '{
  "monthlyGrossIncome": 20000, "creditScore": 7, "riskCategory": "MEDIUM",
  "requestedAmount": 20000, "requestedTermMonths": 36, "dti": 20, "productType": "PERSONAL"
}')
echo "$ELIG" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('count:',j.length);j.forEach(p=>console.log(' -',p.productId,p.productName,p.interestRate,'recommended:',p.recommended))})"

echo "=== eligible products (business) ==="
$CURL -X POST $BASE/api/products/eligible -H "Content-Type: application/json" -d '{
  "creditScore": 7, "requestedAmount": 100000, "requestedTermMonths": 24, "productType": "BUSINESS"
}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('count:',j.length)})"

echo "=== admin product CRUD ==="
CREATE=$($CURL -X POST $BASE/api/products/admin -H "Content-Type: application/json" -d '{
  "productCode":"TEST001","productName":"Test Product","description":"temp","annualInterestRate":5,
  "minAmount":1000,"maxAmount":10000,"minTermMonths":6,"maxTermMonths":24,"minCreditScore":5,
  "minMonthlyIncome":5000,"maxDti":50,"riskCategories":"LOW,MEDIUM,HIGH","active":true,"productType":"PERSONAL"
}')
echo "$CREATE"
PID=$(echo "$CREATE" | jget ".id")
echo "created id=$PID"

UPDATE=$($CURL -X PUT $BASE/api/products/admin/$PID -H "Content-Type: application/json" -d '{
  "productCode":"TEST001","productName":"Test Product Updated","description":"temp2","annualInterestRate":5.5,
  "minAmount":1000,"maxAmount":10000,"minTermMonths":6,"maxTermMonths":24,"minCreditScore":5,
  "minMonthlyIncome":5000,"maxDti":50,"riskCategories":"LOW,MEDIUM,HIGH","active":true,"productType":"PERSONAL"
}')
echo "updated name=$(echo "$UPDATE" | jget '.productName') rate=$(echo "$UPDATE" | jget '.annualInterestRate')"

$CURL -o /dev/null -w "delete http_code=%{http_code}\n" -X DELETE $BASE/api/products/admin/$PID

echo "=== admin/all count ==="
$CURL $BASE/api/products/admin/all | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('total products:',j.length)})"

echo "=== select product + get selection ==="
SEL=$($CURL -X POST $BASE/api/products/select -H "Content-Type: application/json" -d '{"applicationRef":"DGB-TEST-SELECT","productCode":"SL001","termMonths":36}')
echo "$SEL"
$CURL $BASE/api/products/selection/DGB-TEST-SELECT | jget ".productCode"

echo "=== ALL DAY 3 CHECKS COMPLETE ==="
