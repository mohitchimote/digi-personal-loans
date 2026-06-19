package com.digibank.auth.config;

import com.digibank.auth.model.Faq;
import com.digibank.auth.model.User;
import com.digibank.auth.repository.FaqRepository;
import com.digibank.auth.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

@Component
public class DataSeeder implements CommandLineRunner {

    private final UserRepository userRepository;
    private final FaqRepository faqRepository;

    public DataSeeder(UserRepository userRepository, FaqRepository faqRepository) {
        this.userRepository = userRepository;
        this.faqRepository = faqRepository;
    }

    @Override
    public void run(String... args) {
        seedUser("underwriter@digibank.com", "000000018", "DigiBank Underwriter", "UNDERWRITER");
        seedUser("admin@digibank.com", "000000026", "DigiBank Admin", "ADMIN");
        seedUser("noa.levi@digibank.il", "000000050", "Noa Levi", "CUSTOMER");
        seedFaqs();
    }

    private void seedUser(String email, String nationalId, String fullName, String role) {
        if (userRepository.existsByEmail(email)) return;
        User user = User.builder()
                .email(email)
                .nationalId(nationalId)
                .idIssueDate(LocalDate.of(2015, 1, 1))
                .fullName(fullName)
                .role(role)
                .enabled(true)
                .emailVerified(true)
                .build();
        userRepository.save(user);
    }

    private void seedFaqs() {
        if (faqRepository.count() > 0) return;

        addFaq("Loan Eligibility", "Who is eligible to apply for a DigiBank personal loan?",
                "To be eligible you must be an Israeli resident aged 18 or over, with a valid Teudat Zehut (National ID), a monthly gross income of at least ₪8,000, and a credit score of 580 or above. Additional criteria may apply based on the product selected.", null, 1);
        addFaq("Loan Eligibility", "Can I apply if I am self-employed?",
                "Yes. Self-employed applicants are welcome. You will need to provide your most recent two years of income tax assessments (Shuma) and bank statements showing regular income deposits.", "placeholder", 2);
        addFaq("Loan Eligibility", "What is the minimum and maximum loan amount?",
                "Our personal loan range is ₪5,000 to ₪300,000, subject to affordability assessment and the specific product you qualify for.", null, 3);

        addFaq("Application Process", "How long does the application take to complete?",
                "The online application typically takes 10–15 minutes to complete. Once submitted, an automated affordability assessment is performed instantly. A conditional decision is usually available within minutes.", "placeholder", 1);
        addFaq("Application Process", "What documents will I need?",
                "You will need: a valid Teudat Zehut (National ID), proof of income (recent payslips or Shuma for self-employed), recent bank statements (last 3 months), and proof of address (utility bill or bank statement).", null, 2);
        addFaq("Application Process", "Can I save my application and return to it later?",
                "Yes. DigiBank's portal automatically saves your progress at every step. Simply log back in and your application will resume exactly where you left off.", null, 3);
        addFaq("Application Process", "What happens after I submit my application?",
                "Your application goes through an automated affordability assessment. If successful, you will be shown eligible loan products. Once you select a product, a conditional approval is issued and your loan agreement documents are generated automatically.", "placeholder", 4);

        addFaq("Interest Rates & Repayments", "What interest rates does DigiBank offer?",
                "Our personal loan rates start from 4.8% APR for qualifying customers. The rate offered to you will depend on your credit profile, loan amount, term, and the product selected. Your personalised rate will be shown before you accept any offer.", null, 1);
        addFaq("Interest Rates & Repayments", "How is my monthly repayment calculated?",
                "Monthly repayments are calculated using the standard amortisation formula, dividing the loan principal equally over the term with interest. Your repayment schedule will be provided in your loan agreement documentation.", "placeholder", 2);
        addFaq("Interest Rates & Repayments", "Can I make early repayments?",
                "Yes. DigiBank allows early partial or full repayments. Early settlement fees may apply — please refer to your loan agreement or speak to your advisor for specific terms.", null, 3);
        addFaq("Interest Rates & Repayments", "On which date will my repayments be taken?",
                "You can choose your preferred monthly repayment date during the application (1st–28th of the month). Repayments are collected via direct debit from your nominated bank account.", null, 4);

        addFaq("Credit & Affordability", "Will applying affect my credit score?",
                "The initial application performs a soft credit search, which does not affect your credit score. A full credit search will only be performed when you accept a conditional offer, as disclosed in the credit consent declaration.", null, 1);
        addFaq("Credit & Affordability", "What is the Debt-to-Income (DTI) ratio?",
                "Your DTI ratio compares your total monthly debt obligations to your gross monthly income. DigiBank's lending policy requires a DTI ratio of 40% or below. A lower DTI demonstrates stronger repayment capacity.", null, 2);
        addFaq("Credit & Affordability", "My affordability assessment did not pass — what can I do?",
                "If your automated assessment does not pass, please contact your DigiBank advisor for a manual review. Changes in circumstances, additional income documentation, or a reduced loan amount may result in a different outcome.", null, 3);

        addFaq("Security & Privacy", "How does DigiBank protect my personal data?",
                "All data is encrypted in transit using TLS 1.3 and at rest using AES-256 encryption. DigiBank complies fully with Israeli Privacy Protection Law 5741-1981 and GDPR-equivalent standards.", null, 1);
        addFaq("Security & Privacy", "Who can see my application information?",
                "Only authorised DigiBank personnel directly involved in the processing of your application can access your data. Data is never sold or shared with third parties for marketing purposes.", null, 2);
    }

    private void addFaq(String category, String question, String answer, String videoId, int order) {
        Faq faq = new Faq();
        faq.setCategory(category);
        faq.setQuestion(question);
        faq.setAnswer(answer);
        faq.setVideoId(videoId);
        faq.setDisplayOrder(order);
        faqRepository.save(faq);
    }
}
