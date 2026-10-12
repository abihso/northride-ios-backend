import { Router } from "express";
import { calculateFare, getPerKmRate, isPricingService } from "../utils/pricing.js";

const mapsRoute = Router();

export const googleRequest = async (url, apiName, allowZeroResults = false) => {
  let response;
  try {
    response = await fetch(url);
  } catch (cause) {
    const error = new Error(
      `Could not reach Google ${apiName}. Check the backend's outbound network connection.`,
      { cause },
    );
    error.status = 502;
    throw error;
  }

  const data = await response.json().catch(() => null);
  const googleStatus = data?.status;
  if (allowZeroResults && googleStatus === "ZERO_RESULTS") return data;
  if (!response.ok || (googleStatus && googleStatus !== "OK") || !data) {
    const providerMessage =
      data?.error_message ||
      data?.error?.message ||
      (googleStatus === "ZERO_RESULTS" && apiName === "Directions"
        ? "Google could not find a drivable route between this shop and the selected address. Try a nearby delivery address. If this happens for every address, ask an administrator to correct the shop's map coordinates."
        : googleStatus === "REQUEST_DENIED"
          ? "Check that the required Google Maps API is enabled, billing is active, and the backend server key is valid."
          : googleStatus === "OVER_QUERY_LIMIT"
            ? "Check the Google Maps API quota and billing for the backend server key."
            : googleStatus === "UNKNOWN_ERROR"
              ? "Google reported a temporary error. Please try again."
              : null);
    const status = googleStatus || `HTTP ${response.status}`;
    const error = new Error(
      `Google ${apiName} failed (${status})${providerMessage ? `: ${providerMessage}` : "."}`,
    );
    error.status = googleStatus === "ZERO_RESULTS" ? 422 : 502;
    error.googleStatus = googleStatus || null;
    throw error;
  }
  return data;
};

const coordinatePair = (latitude, longitude) => {
  if (
    latitude === undefined ||
    latitude === null ||
    latitude === "" ||
    longitude === undefined ||
    longitude === null ||
    longitude === ""
  ) {
    throw new Error("Valid pickup and dropoff coordinates are required.");
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    throw new Error("Valid pickup and dropoff coordinates are required.");
  }
  return `${lat},${lng}`;
};

export const getDirections = async (origin, destination) => {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!key) {
    const error = new Error("Google Maps server key is not configured.");
    error.status = 503;
    throw error;
  }
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("key", key);
  return googleRequest(url, "Directions");
};

export const getDeliveryQuote = async (delivery, service = "delivery") => {
  if (!isPricingService(service)) {
    throw new Error("Unsupported pricing service.");
  }
  const origin = coordinatePair(
    delivery.pickupLatitude,
    delivery.pickupLongitude,
  );
  const destination = coordinatePair(
    delivery.dropoffLatitude,
    delivery.dropoffLongitude,
  );
  const directions = await getDirections(origin, destination);
  const meters = directions.routes[0]?.legs[0]?.distance?.value;
  if (!Number.isFinite(meters)) {
    throw new Error("Unable to calculate delivery distance.");
  }
  const distanceKm = meters / 1000;
  const fare = calculateFare(distanceKm, await getPerKmRate(service));
  return {
    directions,
    distanceKm: distanceKm.toFixed(2),
    ...fare,
  };
};

mapsRoute.get("/maps/directions", async (req, res) => {
  try {
    const { origin, destination, service } = req.query;
    if (typeof origin !== "string" || typeof destination !== "string") {
      return res.status(400).json({
        success: false,
        message: "Origin and destination are required.",
      });
    }
    if (service !== undefined && (typeof service !== "string" || !isPricingService(service))) {
      return res.status(400).json({
        success: false,
        message: "Pricing service must be ride or delivery.",
      });
    }
    const parseCoordinates = (value) => {
      const parts = value.split(",");
      if (parts.length !== 2) {
        throw new Error("Origin and destination must be coordinates.");
      }
      return coordinatePair(parts[0], parts[1]);
    };
    const parsedOrigin = parseCoordinates(origin);
    const parsedDestination = parseCoordinates(destination);
    if (!service) {
      return res.json(await getDirections(parsedOrigin, parsedDestination));
    }
    const quote = await getDeliveryQuote({
      pickupLatitude: parsedOrigin.split(",")[0],
      pickupLongitude: parsedOrigin.split(",")[1],
      dropoffLatitude: parsedDestination.split(",")[0],
      dropoffLongitude: parsedDestination.split(",")[1],
    }, service);
    return res.json({
      ...quote.directions,
      pricing: {
        baseFare: quote.baseFare,
        perKmRate: quote.perKmRate,
        totalAmount: quote.totalAmount,
      },
    });
  } catch (error) {
    return res
      .status(error.status || 502)
      .json({ success: false, message: error.message });
  }
});

mapsRoute.get("/maps/places", async (req, res) => {
  try {
    const input =
      typeof req.query.input === "string" ? req.query.input.trim() : "";
    const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    if (!key) {
      return res.status(503).json({
        success: false,
        message: "Google Maps server key is not configured.",
      });
    }
    if (input.length < 2 || input.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Search text must be between 2 and 150 characters.",
      });
    }

    const autocompleteUrl = new URL(
      "https://maps.googleapis.com/maps/api/place/autocomplete/json",
    );
    autocompleteUrl.searchParams.set("input", input);
    autocompleteUrl.searchParams.set("key", key);
    const autocomplete = await googleRequest(
      autocompleteUrl,
      "Places Autocomplete",
      true,
    );
    if (autocomplete.status === "ZERO_RESULTS") {
      return res.json({ success: true, data: [] });
    }
    const places = await Promise.all(
      autocomplete.predictions.slice(0, 5).map(async (place) => {
        const detailsUrl = new URL(
          "https://maps.googleapis.com/maps/api/place/details/json",
        );
        detailsUrl.searchParams.set("place_id", place.place_id);
        detailsUrl.searchParams.set("fields", "geometry");
        detailsUrl.searchParams.set("key", key);
        const details = await googleRequest(detailsUrl, "Place Details");
        const location = details.result?.geometry?.location;
        return location
          ? {
              address: place.description,
              latitude: location.lat,
              longitude: location.lng,
            }
          : null;
      }),
    );

    return res.json({ success: true, data: places.filter(Boolean) });
  } catch (error) {
    return res
      .status(error.status || 502)
      .json({ success: false, message: error.message });
  }
});

export default mapsRoute;
