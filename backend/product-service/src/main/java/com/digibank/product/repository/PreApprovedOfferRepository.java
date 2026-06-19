package com.digibank.product.repository;

import com.digibank.product.model.PreApprovedOffer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface PreApprovedOfferRepository extends JpaRepository<PreApprovedOffer, Long> {
    Optional<PreApprovedOffer> findByNationalIdAndConsumedFalse(String nationalId);
    boolean existsByNationalId(String nationalId);
}
