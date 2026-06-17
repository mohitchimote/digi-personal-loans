package com.digibank.product.repository;

import com.digibank.product.model.ProductSelection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface ProductSelectionRepository extends JpaRepository<ProductSelection, Long> {
    Optional<ProductSelection> findByApplicationRef(String applicationRef);
}
