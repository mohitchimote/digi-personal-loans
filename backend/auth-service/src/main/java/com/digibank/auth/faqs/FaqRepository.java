package com.digibank.auth.faqs;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface FaqRepository extends JpaRepository<Faq, Long> {
    List<Faq> findAllByOrderByCategoryAscDisplayOrderAsc();
    boolean existsByQuestion(String question);
}
