package com.digibank.application.org;

/** One org unit as auth-service lists it: GET /api/auth/internal/org/units returns [{id,parentId,levelId,name,code,active}]. */
public record OrgUnitInfo(Long id, Long parentId, Long levelId, String name, String code, Boolean active) {}
