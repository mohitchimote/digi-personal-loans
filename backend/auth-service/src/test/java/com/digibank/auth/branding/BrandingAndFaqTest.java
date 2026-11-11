package com.digibank.auth.branding;

import com.digibank.auth.access.AccessDbTest;
import com.digibank.auth.config.GlobalExceptionHandler;
import com.digibank.auth.faqs.Faq;
import com.digibank.auth.faqs.FaqController;
import com.digibank.auth.faqs.FaqRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Logo upload hardening and the FAQ's Hebrew fields, against the Worker's behaviour (routes/branding.ts, admin.ts). */
@AccessDbTest
class BrandingAndFaqTest {

    static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H', 'D', 'R', 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0};

    @Autowired BrandingSettingsRepository settings;
    @Autowired FaqRepository faqs;

    @TempDir Path store;
    MockMvc mvc;
    final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void setUp() {
        BrandingController branding = new BrandingController(settings);
        ReflectionTestUtils.setField(branding, "storagePath", store.toString());
        mvc = MockMvcBuilders.standaloneSetup(branding, new FaqController(faqs)).setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    private String upload(String originalName, byte[] bytes) throws Exception {
        return mvc.perform(multipart("/api/auth/admin/branding/logo").file(new MockMultipartFile("file", originalName, "image/png", bytes)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    @Test
    void theLogoIsStoredUnderANameMadeFromItsDetectedTypeNotTheUploadedName() throws Exception {
        JsonNode b = json.readTree(upload("../../evil.sh", PNG));
        String url = b.get("logoUrl").asString();
        assertThat(url).matches("/api/branding/logo/logo_[0-9a-f-]{36}\\.png");
        assertThat(Files.list(store).map(p -> p.getFileName().toString()).toList()).singleElement(org.assertj.core.api.InstanceOfAssertFactories.STRING)
                .matches("logo_[0-9a-f-]{36}\\.png");
        assertThat(store.getParent().resolve("evil.sh")).doesNotExist();
    }

    @Test
    void uploadingANewLogoRemovesThePreviousFile() throws Exception {
        String first = json.readTree(upload("a.png", PNG)).get("logoUrl").asString();
        String second = json.readTree(upload("b.png", PNG)).get("logoUrl").asString();
        assertThat(second).isNotEqualTo(first);
        assertThat(store.resolve(first.substring(first.lastIndexOf('/') + 1))).doesNotExist();
        assertThat(store.resolve(second.substring(second.lastIndexOf('/') + 1))).exists();
    }

    @Test
    void aNonImageIsRefusedWith400AndAnOversizeOneWith413() throws Exception {
        mvc.perform(multipart("/api/auth/admin/branding/logo").file(new MockMultipartFile("file", "x.png", "image/png", "just text".getBytes())))
                .andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/auth/admin/branding/logo").file(new MockMultipartFile("file", "big.png", "image/png", new byte[5 * 1024 * 1024 + 1])))
                .andExpect(status().isPayloadTooLarge());
        assertThat(Files.list(store).count()).isZero();
    }

    @Test
    void aStoredLogoIsServedAndAnythingThatIsNotASafeNameIs404() throws Exception {
        String url = json.readTree(upload("a.png", PNG)).get("logoUrl").asString();
        mvc.perform(get(url)).andExpect(status().isOk()).andExpect(r -> assertThat(r.getResponse().getContentType()).isEqualTo("image/png"));
        mvc.perform(get("/api/branding/logo/..")).andExpect(status().isNotFound());
        mvc.perform(get("/api/branding/logo/.hidden")).andExpect(status().isNotFound());
        mvc.perform(get("/api/branding/logo/missing.png")).andExpect(status().isNotFound());
    }

    // ---- FAQ

    private static Set<String> keys(JsonNode n) {
        Set<String> out = new TreeSet<>();
        n.propertyNames().forEach(out::add);
        return out;
    }

    @Test
    void aFaqKeepsItsHebrewQuestionAndAnswerThroughCreateReadAndUpdate() throws Exception {
        String body = "{\"category\":\"Loans\",\"question\":\"Q?\",\"answer\":\"A.\",\"questionHe\":\"ש?\",\"answerHe\":\"ת.\",\"videoId\":null,\"displayOrder\":2}";
        JsonNode created = json.readTree(mvc.perform(post("/api/auth/admin/faqs").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertThat(keys(created)).containsExactly("answer", "answerHe", "category", "displayOrder", "id", "question", "questionHe", "videoId");
        assertThat(created.get("questionHe").asString()).isEqualTo("ש?");

        JsonNode listed = json.readTree(mvc.perform(get("/api/auth/faqs")).andReturn().getResponse().getContentAsString());
        assertThat(listed.get(0).get("answerHe").asString()).isEqualTo("ת.");

        long id = created.get("id").asLong();
        String update = "{\"category\":\"Loans\",\"question\":\"Q2?\",\"answer\":\"A2.\",\"questionHe\":\"ש2?\",\"answerHe\":null,\"displayOrder\":1}";
        JsonNode updated = json.readTree(mvc.perform(put("/api/auth/admin/faqs/" + id).contentType(MediaType.APPLICATION_JSON).content(update))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(updated.get("questionHe").asString()).isEqualTo("ש2?");
        assertThat(updated.get("answerHe").isNull()).isTrue();
    }

    @Test
    void aFaqWithoutHebrewOrOrderStillSavesAndOrderDefaultsToZero() throws Exception {
        JsonNode c = json.readTree(mvc.perform(post("/api/auth/admin/faqs").contentType(MediaType.APPLICATION_JSON)
                .content("{\"category\":\"C\",\"question\":\"Q\",\"answer\":\"A\"}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertThat(c.get("displayOrder").asInt()).isZero();
        assertThat(c.get("questionHe").isNull()).isTrue();
    }

    @Test
    void categoryQuestionAndAnswerAreRequiredAndAMissingFaqIsA400() throws Exception {
        mvc.perform(post("/api/auth/admin/faqs").contentType(MediaType.APPLICATION_JSON).content("{\"question\":\"Q\",\"answer\":\"A\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/admin/faqs").contentType(MediaType.APPLICATION_JSON).content("{\"category\":\"C\",\"answer\":\"A\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/auth/admin/faqs/9999").contentType(MediaType.APPLICATION_JSON)
                .content("{\"category\":\"C\",\"question\":\"Q\",\"answer\":\"A\"}")).andExpect(status().isBadRequest());
        assertThat(faqs.count()).isZero();
    }
}
