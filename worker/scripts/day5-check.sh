#!/bin/bash
set -e
BASE="${1:-http://127.0.0.1:8787}"
CURL="curl -s"
if [[ "$BASE" == https://* ]]; then CURL="curl -s --ssl-no-revoke"; fi
jget() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j$1)})"; }

echo "=== Business journey: register -> wizard -> submit -> DSCR -> product ==="
BREG=$($CURL -X POST $BASE/api/auth/register -H "Content-Type: application/json" -d '{
  "email":"biz.day5@example.com","nationalId":"401234567","idIssueDate":"2019-05-01",
  "fullName":"Yossi Biz","phoneNumber":"0501112222","accountType":"BUSINESS",
  "companyName":"Day5 Testing Ltd","companyRegistrationNumber":"515123456","companyIndustry":"Tech","companyFoundedYear":2015
}')
BOTP=$(echo "$BREG" | jget ".data.demoOtp")
BVERIFY=$($CURL -X POST $BASE/api/auth/register/verify-otp -H "Content-Type: application/json" -d "{\"email\":\"biz.day5@example.com\",\"otp\":\"$BOTP\"}")
BTOKEN=$(echo "$BVERIFY" | jget ".data.token")
BUSERID=$(echo "$BVERIFY" | jget ".data.userId")
echo "business owner registered, role=$(echo "$BVERIFY" | jget '.data.role') userId=$BUSERID"

BSTART=$($CURL -X POST $BASE/api/applications/start-business -H "Content-Type: application/json" -H "Authorization: Bearer $BTOKEN" -d "{\"customerId\":$BUSERID,\"customerEmail\":\"biz.day5@example.com\"}")
BREF=$(echo "$BSTART" | jget ".applicationRef")
echo "business application: $BREF, currentSection=$(echo "$BSTART" | jget '.currentSection')"

$CURL -X PUT "$BASE/api/applications/$BREF/section" -H "Content-Type: application/json" -d '{"section":"companyDetails","data":{"loanAmount":150000,"loanPurpose":"Expansion","loanTerm":36}}' > /dev/null
$CURL -X PUT "$BASE/api/applications/$BREF/section" -H "Content-Type: application/json" -d '{"section":"signatories","data":{"signatories":[{"name":"Yossi Biz","nationalId":"401234567","title":"CEO","ownershipPct":100,"primary":true}]}}' > /dev/null
$CURL -X PUT "$BASE/api/applications/$BREF/section" -H "Content-Type: application/json" -d '{"section":"connectBusinessBank","data":{"connected":true}}' > /dev/null
$CURL -X PUT "$BASE/api/applications/$BREF/section" -H "Content-Type: application/json" -d '{"section":"businessFinancials","data":{"monthlyRevenue":150000,"annualTurnover":1800000}}' > /dev/null
$CURL -X PUT "$BASE/api/applications/$BREF/section" -H "Content-Type: application/json" -d '{"section":"businessOutgoings","data":{"payroll":50000}}' > /dev/null
$CURL -X PUT "$BASE/api/applications/$BREF/section" -H "Content-Type: application/json" -d '{"section":"businessCreditDeclarations","data":{"directorCreditScore":75}}' > /dev/null
$CURL -X PUT "$BASE/api/applications/$BREF/section" -H "Content-Type: application/json" -d '{"section":"verifyId","data":{"idVerified":true}}' > /dev/null
$CURL -X PUT "$BASE/api/applications/$BREF/section" -H "Content-Type: application/json" -d '{"section":"directDebit","data":{"accountNumber":"12345"}}' > /dev/null
FINAL=$($CURL -X PUT "$BASE/api/applications/$BREF/section" -H "Content-Type: application/json" -d '{"section":"reviewSubmit","data":{"termsAccepted":true}}')
echo "after all sections: completion=$(echo "$FINAL" | jget '.completionPercentage')"

SUB=$($CURL -X POST "$BASE/api/applications/$BREF/submit")
echo "submitted: status=$(echo "$SUB" | jget '.status')"

DSCR=$($CURL -X POST $BASE/api/affordability/check-business -H "Content-Type: application/json" -d '{"annualTurnover":1800000,"monthlyRevenue":150000,"monthlyOutgoings":90000,"requestedLoanAmount":150000,"requestedTermMonths":36,"directorCreditScore":8}')
echo "DSCR passed=$(echo "$DSCR" | jget '.passed')"
$CURL -X PUT "$BASE/api/applications/$BREF/affordability-result" -H "Content-Type: application/json" -d "$DSCR" > /dev/null

ELIG=$($CURL -X POST $BASE/api/products/eligible -H "Content-Type: application/json" -d '{"creditScore":8,"requestedAmount":150000,"requestedTermMonths":36,"productType":"BUSINESS"}')
echo "eligible business products: $(echo "$ELIG" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).length))")"

SELPROD=$($CURL -X POST "$BASE/api/applications/$BREF/select-product" -H "Content-Type: application/json" -d '{"productId":"BTL001","productName":"Business Term Loan","interestRate":7.0,"termMonths":36,"monthlyRepayment":4633}')
echo "after select-product: status=$(echo "$SELPROD" | jget '.status') (business never auto-approves, should be UNDER_REVIEW)"

echo ""
echo "=== Banker journey: create assisted account -> profile lookup -> assisted section save ==="
BANKER_OTP_REQ=$($CURL -X POST $BASE/api/auth/login/request-otp -H "Content-Type: application/json" -d '{"nationalId":"000000027"}')
BANKER_OTP=$(echo "$BANKER_OTP_REQ" | jget ".data.demoOtp")
BANKER_VERIFY=$($CURL -X POST $BASE/api/auth/login/verify-otp -H "Content-Type: application/json" -d "{\"nationalId\":\"000000027\",\"otp\":\"$BANKER_OTP\"}")
BANKER_TOKEN=$(echo "$BANKER_VERIFY" | jget ".data.token")
echo "banker logged in, role=$(echo "$BANKER_VERIFY" | jget '.data.role')"

CUSTREG=$($CURL -X POST $BASE/api/auth/register-by-staff -H "Content-Type: application/json" -H "Authorization: Bearer $BANKER_TOKEN" -d '{
  "email":"assisted.day5@example.com","nationalId":"501234567","idIssueDate":"2020-01-01",
  "fullName":"Assisted Customer","phoneNumber":"0509998888","accountType":"PERSONAL"
}')
echo "$CUSTREG"
CUSTID=$(echo "$CUSTREG" | jget ".data.userId")
echo "customer created by banker: id=$CUSTID enabled-without-otp=$([ -n "$CUSTID" ] && echo yes)"

PROFILE=$($CURL "$BASE/api/auth/customer-profile/$CUSTID" -H "Authorization: Bearer $BANKER_TOKEN")
echo "profile lookup: $(echo "$PROFILE" | jget '.data.fullName')"

echo "=== profile lookup WITHOUT banker token (expect 401) ==="
$CURL -o /dev/null -w "http_code=%{http_code}\n" "$BASE/api/auth/customer-profile/$CUSTID"

ASSISTSTART=$($CURL -X POST $BASE/api/applications/start -H "Content-Type: application/json" -d "{\"customerId\":$CUSTID,\"customerEmail\":\"assisted.day5@example.com\"}")
AREF=$(echo "$ASSISTSTART" | jget ".applicationRef")
$CURL -X PUT "$BASE/api/applications/$AREF/section-by-underwriter?editedBy=Banker%20Staff" -H "Content-Type: application/json" -d '{"section":"loanRequirements","data":{"loanAmount":15000,"loanPurpose":"Car","loanTerm":24}}' > /dev/null
NOTES=$($CURL "$BASE/api/applications/$AREF/notes")
echo "audit note logged: $(echo "$NOTES" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j[0].note, j[0].noteType)})")"

echo "=== banker-queue includes this draft ==="
$CURL "$BASE/api/applications/banker-queue" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('contains:',j.some(a=>a.applicationRef==='$AREF'))})"

echo ""
echo "=== Admin: FAQ + branding CRUD via admin token ==="
ADMIN_OTP_REQ=$($CURL -X POST $BASE/api/auth/login/request-otp -H "Content-Type: application/json" -d '{"nationalId":"000000015"}')
ADMIN_OTP=$(echo "$ADMIN_OTP_REQ" | jget ".data.demoOtp")
ADMIN_VERIFY=$($CURL -X POST $BASE/api/auth/login/verify-otp -H "Content-Type: application/json" -d "{\"nationalId\":\"000000015\",\"otp\":\"$ADMIN_OTP\"}")
ADMIN_TOKEN=$(echo "$ADMIN_VERIFY" | jget ".data.token")

NEWFAQ=$($CURL -X POST $BASE/api/auth/admin/faqs -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"category":"Test","question":"Day 5 test question?","answer":"Day 5 test answer.","displayOrder":99}')
FAQID=$(echo "$NEWFAQ" | jget ".id")
echo "faq created: id=$FAQID"
$CURL -X DELETE "$BASE/api/auth/admin/faqs/$FAQID" -H "Authorization: Bearer $ADMIN_TOKEN" -o /dev/null -w "faq delete http_code=%{http_code}\n"

BRAND=$($CURL -X PUT $BASE/api/auth/admin/branding -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"primaryColor":"#003366","accentColor":"#FBB034"}')
echo "branding updated: $BRAND"

echo "=== ALL DAY 5 CROSS-CUTTING CHECKS COMPLETE ==="
