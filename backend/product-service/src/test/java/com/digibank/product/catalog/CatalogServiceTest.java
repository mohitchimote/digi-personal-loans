package com.digibank.product.catalog;

import com.digibank.product.cache.SimpleCache;
import com.digibank.product.catalog.dto.EligibleProduct;
import com.digibank.product.catalog.dto.ProductEligibilityRequest;
import com.digibank.product.model.LoanProduct;
import com.digibank.product.preapproved.PreApprovedOffer;
import com.digibank.product.preapproved.PreApprovedOfferRepository;
import com.digibank.product.preapproved.PreApprovedOfferService;
import com.digibank.product.repository.LoanProductRepository;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CatalogServiceTest {

    LoanProductRepository repo;
    CatalogService service;

    @BeforeEach
    void setUp() {
        repo = mock(LoanProductRepository.class);
        service = new CatalogService(repo, new SimpleCache());
    }

    private static LoanProduct product(String code, String rate) {
        return LoanProduct.builder().productCode(code).productName(code + " name").annualInterestRate(new BigDecimal(rate))
                .minAmount(new BigDecimal("10000")).maxAmount(new BigDecimal("100000")).minTermMonths(12).maxTermMonths(60)
                .minCreditScore(6).minMonthlyIncome(new BigDecimal("8000")).maxDti(new BigDecimal("40"))
                .riskCategories("LOW,MEDIUM").active(true).productType("PERSONAL").build();
    }

    // ---- eligibility ------------------------------------------------------------------------

    @Test
    void theCheapestEligibleProductIsRecommendedAsBestRate() {
        when(repo.findByActiveTrueAndProductType("PERSONAL")).thenReturn(List.of(product("A", "6.0"), product("B", "4.5")));
        List<EligibleProduct> out = service.getEligibleProducts(new ProductEligibilityRequest());
        assertThat(out).extracting(EligibleProduct::getProductId).containsExactly("B", "A");
        assertThat(out.get(0).isRecommended()).isTrue();
        assertThat(out.get(0).getBadge()).isEqualTo("Best Rate");
        assertThat(out.get(1).isRecommended()).isFalse();
        assertThat(out.get(1).getBadge()).isNull();
    }

    @Test
    void aCriterionOnlyAppliesWhenTheProductSetsIt() {
        LoanProduct open = LoanProduct.builder().productCode("OPEN").productName("Open").productType("PERSONAL").active(true).build();
        when(repo.findByActiveTrueAndProductType("PERSONAL")).thenReturn(List.of(open));
        ProductEligibilityRequest req = new ProductEligibilityRequest();
        req.setCreditScore(1);
        req.setMonthlyGrossIncome(new BigDecimal("1"));
        req.setRequestedAmount(new BigDecimal("1"));
        req.setDti(new BigDecimal("99"));
        req.setRiskCategory("HIGH");
        List<EligibleProduct> out = service.getEligibleProducts(req);
        assertThat(out).hasSize(1);
        assertThat(out.get(0).getInterestRate()).isEqualByComparingTo("0");
        assertThat(out.get(0).getMonthlyRepayment()).isNotNull();
    }

    @Test
    void eachCriterionFiltersWhenBothSidesSetIt() {
        when(repo.findByActiveTrueAndProductType("PERSONAL")).thenReturn(List.of(product("A", "5")));
        for (var tweak : List.<java.util.function.Consumer<ProductEligibilityRequest>>of(
                r -> r.setCreditScore(5),
                r -> r.setMonthlyGrossIncome(new BigDecimal("7999")),
                r -> r.setRequestedAmount(new BigDecimal("9999")),
                r -> r.setRequestedAmount(new BigDecimal("100001")),
                r -> r.setDti(new BigDecimal("41")),
                r -> r.setRiskCategory("HIGH"))) {
            ProductEligibilityRequest req = new ProductEligibilityRequest();
            tweak.accept(req);
            assertThat(service.getEligibleProducts(req)).isEmpty();
        }
        ProductEligibilityRequest edge = new ProductEligibilityRequest();
        edge.setCreditScore(6);
        edge.setMonthlyGrossIncome(new BigDecimal("8000"));
        edge.setRequestedAmount(new BigDecimal("100000"));
        edge.setDti(new BigDecimal("40"));
        edge.setRiskCategory("MEDIUM");
        assertThat(service.getEligibleProducts(edge)).hasSize(1);
    }

    @Test
    void theQuoteUsesTheRequestedAmountAndTermElseTheProductMinimums() {
        when(repo.findByActiveTrueAndProductType("PERSONAL")).thenReturn(List.of(product("A", "6.00")));
        EligibleProduct dflt = service.getEligibleProducts(new ProductEligibilityRequest()).get(0);
        // 10,000 over 12 months at 6%: the standard annuity instalment.
        assertThat(dflt.getMonthlyRepayment()).isEqualByComparingTo("860.66");
        assertThat(dflt.getTotalRepayable()).isEqualByComparingTo("10327.92");
        ProductEligibilityRequest req = new ProductEligibilityRequest();
        req.setRequestedAmount(new BigDecimal("50000"));
        req.setRequestedTermMonths(24);
        assertThat(service.getEligibleProducts(req).get(0).getMonthlyRepayment()).isEqualByComparingTo("2216.03");
    }

    @Test
    void theCatalogIsCachedPerTypeUntilAnAdminChangesIt() {
        when(repo.findByActiveTrueAndProductType("PERSONAL")).thenReturn(List.of(product("A", "5")));
        service.getEligibleProducts(new ProductEligibilityRequest());
        service.getEligibleProducts(new ProductEligibilityRequest());
        verify(repo, times(1)).findByActiveTrueAndProductType("PERSONAL");
        when(repo.existsByProductCode("NEW")).thenReturn(false);
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));
        service.createProduct(product("NEW", "5"));
        service.getEligibleProducts(new ProductEligibilityRequest());
        verify(repo, times(2)).findByActiveTrueAndProductType("PERSONAL");
    }

    // ---- admin ------------------------------------------------------------------------------

    @Test
    void createRequiresACodeRejectsADuplicateAndDefaultsTheType() {
        LoanProduct noCode = product(" ", "5");
        assertThatThrownBy(() -> service.createProduct(noCode)).hasMessage("Product code is required.");
        when(repo.existsByProductCode("DUP")).thenReturn(true);
        assertThatThrownBy(() -> service.createProduct(product("DUP", "5"))).hasMessage("Product code already exists: DUP");
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));
        LoanProduct untyped = product("X1", "5");
        untyped.setProductType(" ");
        assertThat(service.createProduct(untyped).getProductType()).isEqualTo("PERSONAL");
    }

    @Test
    void updateIsAPartialMergeLeavingUnsentFieldsAlone() {
        LoanProduct existing = product("A", "5.5");
        existing.setActive(false);
        existing.setId(3L);
        when(repo.findById(3L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));
        LoanProduct out = service.updateProduct(3L, Map.of("productName", "Renamed", "maxAmount", 250000, "minCreditScore", 7));
        assertThat(out.getProductName()).isEqualTo("Renamed");
        assertThat(out.getMaxAmount()).isEqualByComparingTo("250000");
        assertThat(out.getMinCreditScore()).isEqualTo(7);
        assertThat(out.getAnnualInterestRate()).isEqualByComparingTo("5.5");
        assertThat(out.isActive()).as("absent 'active' keeps the stored value").isFalse();
        assertThat(out.getProductCode()).isEqualTo("A");
        assertThat(out.getRiskCategories()).isEqualTo("LOW,MEDIUM");
    }

    @Test
    void updateRejectsAnUnknownIdAndACodeThatBelongsToAnotherProduct() {
        when(repo.findById(9L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.updateProduct(9L, Map.of())).hasMessage("Product not found: 9");
        LoanProduct existing = product("A", "5");
        when(repo.findById(3L)).thenReturn(Optional.of(existing));
        when(repo.existsByProductCode("B")).thenReturn(true);
        assertThatThrownBy(() -> service.updateProduct(3L, Map.of("productCode", "B"))).hasMessage("Product code already exists: B");
    }

    @Test
    void deleteRejectsAnUnknownId() {
        when(repo.existsById(4L)).thenReturn(false);
        assertThatThrownBy(() -> service.deleteProduct(4L)).hasMessage("Product not found: 4");
    }

    // ---- seed parity with the Worker's seed.sql ---------------------------------------------

    private static final Path SEED = Path.of("..", "..", "worker", "seed.sql");

    /** Splits a SQL SELECT value list on top-level commas, unquoting 'strings'. */
    private static List<String> sqlValues(String list) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < list.length(); i++) {
            char c = list.charAt(i);
            if (c == '\'') {
                if (quoted && i + 1 < list.length() && list.charAt(i + 1) == '\'') { cur.append('\''); i++; }
                else quoted = !quoted;
            } else if (c == ',' && !quoted) { out.add(cur.toString().trim()); cur.setLength(0); }
            else cur.append(c);
        }
        out.add(cur.toString().trim());
        return out;
    }

    private static List<List<String>> seedRows(String table) throws IOException {
        String sql = Files.readString(SEED, StandardCharsets.UTF_8);
        Matcher m = Pattern.compile("INSERT INTO " + table + " \\([^)]*\\)\\s*SELECT (.*?)\\s*WHERE NOT EXISTS", Pattern.DOTALL).matcher(sql);
        List<List<String>> rows = new ArrayList<>();
        while (m.find()) rows.add(sqlValues(m.group(1)));
        return rows;
    }

    @Test
    void theSeededProductCatalogMatchesTheWorkersSeedData() throws IOException {
        Assumptions.assumeTrue(Files.exists(SEED), "Worker seed.sql not present");
        when(repo.count()).thenReturn(0L);
        when(repo.findAll()).thenReturn(List.of());
        when(repo.findByActiveTrueAndProductType("BUSINESS")).thenReturn(List.of());
        service.initializeProducts();
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Iterable<LoanProduct>> cap = ArgumentCaptor.forClass(Iterable.class);
        verify(repo, times(2)).saveAll(cap.capture());
        List<LoanProduct> seeded = new ArrayList<>();
        cap.getAllValues().forEach(it -> it.forEach(seeded::add));

        List<List<String>> rows = seedRows("loan_products");
        assertThat(rows).hasSize(seeded.size());
        for (List<String> r : rows) {
            LoanProduct p = seeded.stream().filter(s -> s.getProductCode().equals(r.get(0))).findFirst().orElseThrow(
                    () -> new AssertionError("Worker seeds product " + r.get(0) + " that Java does not"));
            assertThat(p.getProductName()).isEqualTo(r.get(1));
            assertThat(p.getDescription()).isEqualTo(r.get(2));
            assertThat(p.getAnnualInterestRate()).isEqualByComparingTo(r.get(3));
            assertThat(p.getMinAmount()).isEqualByComparingTo(r.get(4));
            assertThat(p.getMaxAmount()).isEqualByComparingTo(r.get(5));
            assertThat(p.getMinTermMonths()).isEqualTo(Integer.parseInt(r.get(6)));
            assertThat(p.getMaxTermMonths()).isEqualTo(Integer.parseInt(r.get(7)));
            assertThat(p.getMinCreditScore()).isEqualTo(Integer.parseInt(r.get(8)));
            assertThat(p.getMinMonthlyIncome()).isEqualByComparingTo(r.get(9));
            assertThat(p.getMaxDti()).isEqualByComparingTo(r.get(10));
            assertThat(p.getRiskCategories()).isEqualTo(r.get(11));
            assertThat(p.isActive()).isEqualTo("1".equals(r.get(12)));
            assertThat(p.getProductType()).isEqualTo(r.get(13));
        }
    }

    @Test
    void theSeededPreApprovedOffersMatchTheWorkersSeedData() throws IOException {
        Assumptions.assumeTrue(Files.exists(SEED), "Worker seed.sql not present");
        PreApprovedOfferRepository offers = mock(PreApprovedOfferRepository.class);
        new PreApprovedOfferService(offers).seedPreApprovedOffers();
        ArgumentCaptor<PreApprovedOffer> cap = ArgumentCaptor.forClass(PreApprovedOffer.class);
        verify(offers, org.mockito.Mockito.atLeastOnce()).save(cap.capture());

        List<List<String>> rows = seedRows("pre_approved_offers");
        assertThat(rows).hasSize(cap.getAllValues().size());
        for (List<String> r : rows) {
            PreApprovedOffer o = cap.getAllValues().stream().filter(s -> s.getNationalId().equals(r.get(0))).findFirst().orElseThrow(
                    () -> new AssertionError("Worker seeds an offer for " + r.get(0) + " that Java does not"));
            assertThat(o.getProductCode()).isEqualTo(r.get(1));
            assertThat(o.getProductName()).isEqualTo(r.get(2));
            assertThat(o.getAnnualInterestRate()).isEqualByComparingTo(r.get(3));
            assertThat(o.getAmount()).isEqualByComparingTo(r.get(4));
            assertThat(o.getTermMonths()).isEqualTo(Integer.parseInt(r.get(5)));
            assertThat(o.getMonthlyRepayment()).isEqualByComparingTo(r.get(6));
            assertThat(o.getTotalRepayable()).isEqualByComparingTo(r.get(7));
            assertThat(o.isConsumed()).isFalse();
        }
    }
}
