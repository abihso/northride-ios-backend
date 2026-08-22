function formatPhoneForInfobip(phone, defaultCountryCode = "233") {
    let cleaned = phone.trim();
    const hasPlus = cleaned.startsWith("+");
    
    // Remove all non-numeric characters
    cleaned = cleaned.replace(/\D/g, "");

    // If it started with '+', assume it already has the full international country code
    if (hasPlus) {
        return cleaned;
    }

    // Strip local leading zero if present (e.g., 053... -> 53...)
    if (cleaned.startsWith("0")) {
        cleaned = cleaned.substring(1);
    }

    // Prepend default country code if not already included
    const cleanCountryCode = defaultCountryCode.replace(/\D/g, "");
    if (!cleaned.startsWith(cleanCountryCode)) {
        cleaned = cleanCountryCode + cleaned;
    }

    return cleaned;
}