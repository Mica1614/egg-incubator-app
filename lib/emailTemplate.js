// @ts-nocheck
/**
 * emailTemplate.js
 *
 * Builds a styled HTML email body for incubator alert notifications.
 * Handles three alert categories:
 *   - "sensor"  → abnormal temperature / humidity readings
 *   - "water"   → low water level warning
 *   - "offline" → device went offline
 */

// ── Per-alert-type configuration ─────────────────────────────────────────────
const ALERT_CONFIG = {
  test: {
    emoji: "✅",
    color: "#10B981",       // emerald
    borderColor: "#059669",
    title: "Test Email",
    description: "This is a test email. Your Egg Incubator alert system is working correctly.",
  },
  sensor: {
    emoji: "⚠️",
    color: "#F59E0B",       // amber
    borderColor: "#D97706",
    title: "Abnormal Sensor Reading",
    description: "One or more sensor values have moved outside the safe operating range for your incubator.",
  },
  water: {
    emoji: "💧",
    color: "#3B82F6",       // blue
    borderColor: "#2563EB",
    title: "Water Level Warning",
    description: "The water level in your incubator is critically low. Refill soon to maintain proper humidity.",
  },
  offline: {
    emoji: "🔌",
    color: "#EF4444",       // red
    borderColor: "#DC2626",
    title: "Device Offline",
    description: "Your incubator device has gone offline and is no longer sending data. Check the power and network connection.",
  },
  online: {
    emoji: "✅",
    color: "#10B981",       // emerald
    borderColor: "#059669",
    title: "Device Back Online",
    description: "Your incubator device has reconnected and is sending data again.",
  },
  candling: {
    emoji: "🕯️",
    color: "#0891b2",       // cyan
    borderColor: "#0e7490",
    title: "Egg Candling Reminder",
    description: "It's time to candle your eggs to check embryo development and viability.",
  },
};

/**
 * Renders a table row for a single sensor reading.
 * Highlights the cell red when the value is flagged as abnormal.
 */
function sensorRow(label, value, unit = "", isAbnormal = false) {
  const valueStyle = isAbnormal
    ? "color:#DC2626;font-weight:700;"
    : "color:#111827;font-weight:600;";
  return `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #F3F4F6;color:#6B7280;font-size:14px;">${label}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F3F4F6;${valueStyle}font-size:14px;">
        ${value !== undefined && value !== null ? `${value}${unit}` : "—"}
        ${isAbnormal ? " ⚠️" : ""}
      </td>
    </tr>`;
}

/**
 * Builds the sensor data table block (only shown for "sensor" alerts).
 */
function buildSensorTable(sensorData) {
  if (!sensorData) return "";

  const { temperature, humidity, waterLevel } = sensorData;

  // Flag values outside safe ranges
  const tempAbnormal =
    temperature !== undefined &&
    (temperature < 36.5 || temperature > 38.5);

  const humidityAbnormal =
    humidity !== undefined && (humidity < 40 || humidity > 65);

  const waterAbnormal =
    waterLevel !== undefined && waterLevel < 20;

  return `
  <table width="100%" cellpadding="0" cellspacing="0"
    style="border-collapse:collapse;margin-top:16px;background:#F9FAFB;border-radius:8px;overflow:hidden;">
    <thead>
      <tr style="background:#F3F4F6;">
        <th style="padding:10px 12px;text-align:left;color:#374151;font-size:13px;font-weight:600;">Sensor</th>
        <th style="padding:10px 12px;text-align:left;color:#374151;font-size:13px;font-weight:600;">Current Value</th>
      </tr>
    </thead>
    <tbody>
      ${sensorRow("Temperature", temperature, " °C", tempAbnormal)}
      ${sensorRow("Humidity", humidity, " %", humidityAbnormal)}
      ${sensorRow("Water Level", waterLevel, " %", waterAbnormal)}
    </tbody>
  </table>`;
}

/**
 * Main export — returns a complete HTML string ready to pass to nodemailer's `html` field.
 *
 * @param {object} opts
 * @param {"sensor"|"water"|"offline"} opts.alertType
 * @param {string} [opts.deviceId]
 * @param {object} [opts.sensorData]   { temperature, humidity, waterLevel }
 * @param {string} [opts.message]      Optional extra note to display
 */
export function buildAlertEmailHtml({ alertType, deviceId, sensorData, message }) {
  const cfg = ALERT_CONFIG[alertType] ?? ALERT_CONFIG.sensor;
  const timestamp = new Date().toLocaleString("en-US", { timeZoneName: "short" });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${cfg.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0"
          style="max-width:600px;background:#FFFFFF;border-radius:12px;overflow:hidden;
                 box-shadow:0 4px 6px rgba(0,0,0,0.07);">

          <!-- Header bar -->
          <tr>
            <td style="background:${cfg.color};padding:24px 32px;">
              <p style="margin:0;font-size:28px;">${cfg.emoji}</p>
              <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:20px;font-weight:700;letter-spacing:-0.3px;">
                ${cfg.title}
              </h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">
                Egg Incubator Alert System
              </p>
            </td>
          </tr>

          <!-- Body -->
          <td style="padding:28px 32px;">

            <!-- Alert description -->
            <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
              ${cfg.description}
            </p>

            <!-- Device info -->
            ${deviceId ? `
            <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;
                        padding:12px 16px;margin-bottom:16px;">
              <p style="margin:0;font-size:13px;color:#6B7280;">Device ID</p>
              <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#111827;">${deviceId}</p>
            </div>` : ""}

            <!-- Sensor table (sensor alerts only) -->
            ${alertType === "sensor" ? buildSensorTable(sensorData) : ""}

            <!-- Water level badge (water alerts) -->
            ${alertType === "water" && sensorData?.waterLevel !== undefined ? `
            <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;
                        padding:16px;margin-top:16px;text-align:center;">
              <p style="margin:0;font-size:13px;color:#1D4ED8;font-weight:500;">Current Water Level</p>
              <p style="margin:6px 0 0;font-size:36px;font-weight:800;color:#1D4ED8;">
                ${sensorData.waterLevel}%
              </p>
            </div>` : ""}

            <!-- Optional extra message -->
            ${message ? `
            <div style="margin-top:20px;padding:12px 16px;background:#FFFBEB;
                        border-left:4px solid ${cfg.borderColor};border-radius:4px;">
              <p style="margin:0;font-size:14px;color:#92400E;">${message}</p>
            </div>` : ""}

            <!-- Action recommendation -->
            <div style="margin-top:24px;padding:16px;background:#F0FDF4;
                        border:1px solid #BBF7D0;border-radius:8px;">
              <p style="margin:0;font-size:14px;font-weight:600;color:#166534;">
                Recommended Action
              </p>
              <p style="margin:6px 0 0;font-size:14px;color:#166534;">
                ${alertType === "sensor"
                  ? "Check your incubator settings and ensure temperature and humidity are within safe ranges (36.5–38.5 °C, 40–65 %)."
                  : alertType === "water"
                  ? "Refill the water reservoir as soon as possible to restore proper humidity levels."
                  : "Verify the power supply, network connection, and that the device firmware is running correctly."}
              </p>
            </div>

          </td>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #F3F4F6;background:#F9FAFB;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;">
                Sent by <strong>Egg Incubator Alert System</strong> &bull; ${timestamp}
              </p>
              <p style="margin:6px 0 0;font-size:12px;color:#9CA3AF;text-align:center;">
                You are receiving this because alert email notifications are enabled for this device.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>`;
}
