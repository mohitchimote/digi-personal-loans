package com.digibank.product.repository;

import com.digibank.product.model.LoanProduct;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface LoanProductRepository extends JpaRepository<LoanProduct, Long> {
    List<LoanProduct> findByActiveTrue();
    List<LoanProduct> findByActiveTrueAndProductType(String productType);
    List<LoanProduct> findAllByOrderByProductTypeAscProductNameAsc();
    boolean existsByProductCode(String productCode);
}
