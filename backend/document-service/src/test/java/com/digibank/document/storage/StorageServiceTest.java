package com.digibank.document.storage;

import com.digibank.document.config.AppException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mockito;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StorageServiceTest {

    @TempDir Path dir;

    private StorageService service() {
        UploadedDocumentRepository repo = Mockito.mock(UploadedDocumentRepository.class);
        Mockito.when(repo.save(Mockito.any())).thenAnswer(i -> i.getArgument(0));
        StorageService s = new StorageService(repo);
        ReflectionTestUtils.setField(s, "storagePath", dir.toString());
        return s;
    }

    private static byte[] pdf(int size) {
        byte[] b = new byte[size];
        byte[] magic = "%PDF-1.4\n".getBytes();
        System.arraycopy(magic, 0, b, 0, Math.min(magic.length, size));
        return b;
    }

    @Test
    void aPdfIsAcceptedAndStoredWithItsDetectedType() throws Exception {
        UploadedDocument saved = service().storeUpload("APP-1", 8L, "PAYSLIPS",
                new MockMultipartFile("file", "payslip.pdf", "application/octet-stream", pdf(100)));
        assertThat(saved.getMimeType()).isEqualTo("application/pdf");
        assertThat(saved.getOriginalFilename()).isEqualTo("payslip.pdf");
        assertThat(saved.getFileSize()).isEqualTo(100L);
    }

    @Test
    void aFileOverFiveMegabytesIs413WithTheWorkersMessage() {
        assertThatThrownBy(() -> service().storeUpload("APP-1", 8L, "X",
                new MockMultipartFile("file", "big.pdf", "application/pdf", pdf(5 * 1024 * 1024 + 1))))
                .isInstanceOfSatisfying(AppException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(413);
                    assertThat(e.getMessage()).isEqualTo("File is too large. Maximum size is 5MB.");
                });
    }

    @Test
    void exactlyFiveMegabytesIsStillAccepted() throws Exception {
        assertThat(service().storeUpload("APP-1", 8L, "X",
                new MockMultipartFile("file", "ok.pdf", "application/pdf", pdf(5 * 1024 * 1024))).getFileSize())
                .isEqualTo(5L * 1024 * 1024);
    }

    @Test
    void aFileThatIsNotAnAllowedTypeIsRejectedByItsBytesNotItsHeader() {
        assertThatThrownBy(() -> service().storeUpload("APP-1", 8L, "X",
                new MockMultipartFile("file", "evil.pdf", "application/pdf", "<script>alert(1)</script>".getBytes())))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Unsupported file type. Allowed: PDF, JPEG, PNG, DOC, DOCX.");
    }
}
