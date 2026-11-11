package com.digibank.application.workflow;

import java.util.List;

/** A queue the actor may open, from the published definition: which statuses it lists and which filters apply. */
public record QueueSettings(String queue, List<String> statuses, boolean applyScope, boolean hideReferredAbove) {}
