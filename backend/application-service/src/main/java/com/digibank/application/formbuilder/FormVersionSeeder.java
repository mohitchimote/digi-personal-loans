package com.digibank.application.formbuilder;

import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/** Publishes the default form versions on first start; does nothing once any version exists. */
@Component
public class FormVersionSeeder implements CommandLineRunner {

    private final FormVersionService service;

    public FormVersionSeeder(FormVersionService service) {
        this.service = service;
    }

    @Override
    public void run(String... args) {
        service.seedDefaults();
    }
}
