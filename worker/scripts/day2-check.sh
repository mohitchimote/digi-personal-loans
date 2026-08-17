#!/bin/bash
set -e
BASE="${1:-http://127.0.0.1:8787}"
CURL="curl -s"
if [[ "$BASE" == https://* ]]; then CURL="curl -s --ssl-no-revoke"; fi

jget() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j$1)})"; }

echo "=== start application ==="
START=$($CURL -X POST $BASE/api/applications/start -H "Content-Type: application/json" -d '{"customerId":9001,"customerEmail":"day2@example.com"}')
echo "$START" | jget ""
REF=$(echo "$START" | jget ".applicationRef")
echo "ref=$REF status=$(echo "$START" | jget '.status') section=$(echo "$START" | jget '.currentSection')"

save_section() {
  local section=$1
  local data=$2
  local resp=$($CURL -X PUT "$BASE/api/applications/$REF/section" -H "Content-Type: application/json" -d "{\"section\":\"$section\",\"data\":$data}")
  echo "-- saved $section -> status=$(echo "$resp" | jget '.status') next=$(echo "$resp" | jget '.currentSection') completion=$(echo "$resp" | jget '.completionPercentage')"
}

echo "=== walk all 9 personal sections ==="
save_section loanRequirements '{"loanAmount":20000,"loanPurpose":"Home improvement","loanTerm":36,"numberOfApplicants":1}'
save_section personalDetails '{"firstName":"Test","lastName":"User","dateOfBirth":"1990-01-01","nationalId":"923456789","idIssueDate":"2018-01-01"}'
save_section connectBank '{"connected":true,"bankId":"leumi","bankName":"Bank Leumi"}'
save_section incomeEmployment '{"employmentStatus":"Employed","employer":"Acme","monthlyGrossIncome":15000,"monthlyNetIncome":12000}'
save_section outgoings '{"monthlyRent":3000,"monthlyLoans":0,"creditCardPayments":200,"monthlyLivingExpenses":2000}'
save_section creditDeclarations '{"hasDefaulted":false,"hasBankruptcy":false,"hasCCJ":false,"creditScore":700}'
save_section verifyId '{"idVerified":true,"files":["id.pdf"]}'
save_section directDebit '{"accountSource":"manual","accountHolderName":"Test User","accountNumber":"12345678"}'
save_section reviewSubmit '{"termsAccepted":true,"privacyAccepted":true,"creditSearchConsent":true}'

echo "=== fetch app, confirm 100% ready-to-submit ==="
$CURL "$BASE/api/applications/$REF" | jget ".completionPercentage"

echo "=== submit ==="
SUB=$($CURL -X POST "$BASE/api/applications/$REF/submit")
echo "status=$(echo "$SUB" | jget '.status') completion=$(echo "$SUB" | jget '.completionPercentage') submittedAt=$(echo "$SUB" | jget '.submittedAt')"

echo "=== save affordability result (passed) ==="
AR=$($CURL -X PUT "$BASE/api/applications/$REF/affordability-result" -H "Content-Type: application/json" -d '{"passed":true,"dti":20,"hti":15}')
echo "status=$(echo "$AR" | jget '.status')"

echo "=== select product (should auto-approve: 20000 < 30000 single threshold) ==="
SP=$($CURL -X POST "$BASE/api/applications/$REF/select-product" -H "Content-Type: application/json" -d '{"productId":"SL001","productName":"Standard Personal Loan","monthlyRepayment":650,"interestRate":5.5,"termMonths":36}')
echo "status=$(echo "$SP" | jget '.status') approvedAmount=$(echo "$SP" | jget '.approvedAmount')"

echo "=== notes for this application ==="
$CURL "$BASE/api/applications/$REF/notes" | jget ".length"

echo "=== pipeline (should be empty of this app since auto-approved sets APPROVED, still in PIPELINE_STATUSES) ==="
$CURL "$BASE/api/applications/pipeline" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('pipeline count:',j.length, 'contains ref:', j.some(a=>a.applicationRef==='$REF'))})"

echo "=== mandate rules ==="
$CURL "$BASE/api/applications/mandate-rules"
echo

AUTO_APPROVED_REF=$REF

echo "=== second application: manual decline path ==="
START2=$($CURL -X POST $BASE/api/applications/start -H "Content-Type: application/json" -d '{"customerId":9002,"customerEmail":"day2b@example.com"}')
REF=$(echo "$START2" | jget ".applicationRef")
save_section loanRequirements '{"loanAmount":50000,"loanPurpose":"Wedding","loanTerm":48,"numberOfApplicants":1}'
DEC=$($CURL -X POST "$BASE/api/applications/$REF/decline" -H "Content-Type: application/json" -d '{"reason":"Insufficient income","reviewedBy":"underwriter@digibank.com"}')
echo "decline status=$(echo "$DEC" | jget '.status')"

echo "=== third application: send-back with guarantor required ==="
START3=$($CURL -X POST $BASE/api/applications/start -H "Content-Type: application/json" -d '{"customerId":9003,"customerEmail":"day2c@example.com"}')
REF3=$(echo "$START3" | jget ".applicationRef")
SB=$($CURL -X POST "$BASE/api/applications/$REF3/send-back" -H "Content-Type: application/json" -d '{"reason":"Need guarantor","reviewedBy":"underwriter@digibank.com","requireGuarantor":"true"}')
echo "send-back status=$(echo "$SB" | jget '.status') currentSection=$(echo "$SB" | jget '.currentSection') guarantorRequired=$(echo "$SB" | jget '.guarantorRequired')"

echo "=== disbursement flow on the auto-approved application ($AUTO_APPROVED_REF) ==="
DISB=$($CURL -X POST "$BASE/api/applications/$AUTO_APPROVED_REF/disbursement/authorise" -H "Content-Type: application/json" -d '{"reviewedBy":"underwriter@digibank.com"}')
echo "disbursementStatus=$(echo "$DISB" | jget '.disbursementStatus')"

echo "=== refer-to-senior on third application ==="
RTS=$($CURL -X POST "$BASE/api/applications/$REF3/refer-to-senior" -H "Content-Type: application/json" -d '{"reason":"Amount exceeds my mandate","reviewedBy":"underwriter@digibank.com"}')
echo "status=$(echo "$RTS" | jget '.status')"

echo "=== banker-queue sanity ==="
$CURL "$BASE/api/applications/banker-queue" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('banker-queue count:',j.length)})"

echo "=== ALL DAY 2 CHECKS COMPLETE ==="
