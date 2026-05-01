// @ts-nocheck
"use client";

import { useEffect, useRef } from "react";
import { sendNotification, NOTIFICATION_TYPES } from "@/lib/notificationService";

/**
 * Hook to monitor device state changes and send notifications
 * Call this in device detail pages to automatically send notifications
 */
export function useDeviceNotifications(deviceName, deviceState, preferences, enabled = true) {
  const prevStateRef = useRef(null);

  useEffect(() => {
    if (!enabled || !deviceState || !preferences) return;

    const prevState = prevStateRef.current;
    if (!prevState) {
      prevStateRef.current = deviceState;
      return;
    }

    // Check for water level changes
    if (prevState.waterLow !== undefined && deviceState.waterLow !== undefined) {
      if (prevState.waterLow === false && deviceState.waterLow === true) {
        // Water went from OK to Low
        sendNotification(
          NOTIFICATION_TYPES.WATER_LOW,
          deviceName,
          null,
          preferences
        );
      } else if (prevState.waterLow === true && deviceState.waterLow === false) {
        // Water went from Low to OK
        sendNotification(
          NOTIFICATION_TYPES.WATER_OK,
          deviceName,
          null,
          preferences
        );
      }
    }

    // Check for egg turner state changes
    if (prevState.eggTurner !== undefined && deviceState.eggTurner !== undefined) {
      if (prevState.eggTurner === false && deviceState.eggTurner === true) {
        sendNotification(
          NOTIFICATION_TYPES.EGG_TURNER_ON,
          deviceName,
          null,
          preferences
        );
      } else if (prevState.eggTurner === true && deviceState.eggTurner === false) {
        sendNotification(
          NOTIFICATION_TYPES.EGG_TURNER_OFF,
          deviceName,
          null,
          preferences
        );
      }
    }

    // Check for fan state changes
    if (prevState.fan !== undefined && deviceState.fan !== undefined) {
      if (prevState.fan === false && deviceState.fan === true) {
        sendNotification(
          NOTIFICATION_TYPES.FAN_ON,
          deviceName,
          null,
          preferences
        );
      } else if (prevState.fan === true && deviceState.fan === false) {
        sendNotification(
          NOTIFICATION_TYPES.FAN_OFF,
          deviceName,
          null,
          preferences
        );
      }
    }

    // Check for humidifier state changes
    if (prevState.humidifier !== undefined && deviceState.humidifier !== undefined) {
      if (prevState.humidifier === false && deviceState.humidifier === true) {
        sendNotification(
          NOTIFICATION_TYPES.HUMIDIFIER_ON,
          deviceName,
          null,
          preferences
        );
      } else if (prevState.humidifier === true && deviceState.humidifier === false) {
        sendNotification(
          NOTIFICATION_TYPES.HUMIDIFIER_OFF,
          deviceName,
          null,
          preferences
        );
      }
    }

    // Check for abnormal temperature (threshold-based)
    const TEMP_TRIGGER = deviceState.tempTrigger || 37.5;
    const TEMP_STOP = deviceState.tempStop || 38.0;
    const tempIsAbnormal = deviceState.tempC < TEMP_TRIGGER || deviceState.tempC > TEMP_STOP;
    const prevTempIsAbnormal =
      prevState.tempC < TEMP_TRIGGER || prevState.tempC > TEMP_STOP;

    if (prevTempIsAbnormal === false && tempIsAbnormal === true) {
      sendNotification(
        NOTIFICATION_TYPES.TEMP_ABNORMAL,
        deviceName,
        deviceState.tempC?.toFixed(1),
        preferences
      );
    } else if (prevTempIsAbnormal === true && tempIsAbnormal === false) {
      sendNotification(
        NOTIFICATION_TYPES.TEMP_NORMAL,
        deviceName,
        deviceState.tempC?.toFixed(1),
        preferences
      );
    }

    // Check for abnormal humidity (threshold-based)
    const HUM_TRIGGER = deviceState.humidityTrigger || 60;
    const HUM_STOP = deviceState.humidityStop || 65;
    const humIsAbnormal = deviceState.humidity < HUM_TRIGGER || deviceState.humidity > HUM_STOP;
    const prevHumIsAbnormal =
      prevState.humidity < HUM_TRIGGER || prevState.humidity > HUM_STOP;

    if (prevHumIsAbnormal === false && humIsAbnormal === true) {
      sendNotification(
        NOTIFICATION_TYPES.HUMIDITY_ABNORMAL,
        deviceName,
        Math.round(deviceState.humidity),
        preferences
      );
    } else if (prevHumIsAbnormal === true && humIsAbnormal === false) {
      sendNotification(
        NOTIFICATION_TYPES.HUMIDITY_NORMAL,
        deviceName,
        Math.round(deviceState.humidity),
        preferences
      );
    }

    // Update the ref for next comparison
    prevStateRef.current = deviceState;
  }, [deviceState, deviceName, preferences, enabled]);
}
