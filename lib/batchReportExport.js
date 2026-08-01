// @ts-nocheck
"use client";

/**
 * lib/batchReportExport.js — PDF and Excel builders for the batch report.
 *
 * Both consume the model produced by lib/batchReport.mjs, so neither can drift
 * away from what the screen shows. Tables only: egg_scans stores full base64
 * data URLs, and embedding those would make a 40-egg batch export enormous.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { formatDuration } from "@/lib/batchReport.mjs";
import { estimatePower, DEFAULT_CURRENCY } from "@/lib/powerEstimate.mjs";
import { readPowerSettings } from "@/lib/usePowerSettings";
import { analyseBatch } from "@/lib/hatchAnalytics.mjs";
import { validateReadings } from "@/lib/outputValidation.mjs";

const DASH = "—";

function fmtDate(value) {
  if (!value) return DASH;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(value) {
  if (!value) return DASH;
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const num = (value, suffix = "") =>
  value === null || value === undefined || Number.isNaN(value) ? DASH : `${value}${suffix}`;

function fileStamp(report) {
  const label = report?.meta?.batchId || report?.meta?.docId || "batch";
  const safe = String(label).replace(/[^\w.-]+/g, "_");
  return `${safe}_${new Date().toISOString().split("T")[0]}`;
}

/** Energy, hatch metrics and sensor health, derived the same way the screen does. */
function derive(report) {
  // Same wattages and tariff the screen used, so an export never prices energy
  // differently from the page it was generated from.
  const power = readPowerSettings();
  return {
    energy: estimatePower({
      perActuator: report.actuators.perActuator,
      ratings: power.ratings,
      tariff: power.tariff,
      coveragePct: report.coverage.pct,
    }),
    hatch: analyseBatch({
      totalEggs: report.outcome.totalEggs,
      infertileEggs: report.outcome.infertileEggs,
      deadEggs: report.outcome.deadEggs,
      hatchedEggs: report.outcome.hatchedEggs,
    }),
    sensors: validateReadings(
      report.environment.series.map((row) => ({
        createdAt: row.at,
        tempC: row.temp,
        humidity: row.humidity,
      }))
    ),
  };
}

const powerRows = (report) =>
  derive(report).energy.breakdown.map((row) => [
    row.label,
    `${row.watts} W`,
    formatDuration(row.runtimeMs),
    String(row.kwh),
    `${DEFAULT_CURRENCY}${row.cost}`,
  ]);

const sensorIssueRows = (report) =>
  derive(report).sensors.issues.map((issue) => [
    fmtDateTime(issue.at),
    issue.kind === "temperature" ? "Temperature" : "Humidity",
    issue.type,
    issue.detail,
  ]);

/** Rows shared by the PDF summary block and the Excel Summary sheet. */
function summaryRows(report) {
  const { meta, outcome, environment, coverage } = report;
  const { energy, hatch, sensors } = derive(report);
  return [
    ["Batch ID", meta.batchId || DASH],
    ["Egg type", meta.eggType || DASH],
    ["Device", meta.deviceName || meta.deviceId || DASH],
    ["Status", meta.status || DASH],
    ["Start date", fmtDate(meta.startDate)],
    ["Hatch date", fmtDate(meta.hatchingDate)],
    ["Report window", `${fmtDateTime(meta.startDate)} → ${fmtDateTime(meta.endDate)}`],
    ["Window length", formatDuration(meta.windowMs)],
    ["Total eggs", num(outcome.totalEggs)],
    ["Hatched", num(outcome.hatchedEggs)],
    ["Dead", num(outcome.deadEggs)],
    ["Infertile", num(outcome.infertileEggs)],
    ["Hatch rate", num(outcome.hatchRate, "%")],
    ["Chicks available", num(outcome.chicksAvailable)],
    ["Chicks sold", num(outcome.chicksSold)],
    ["Avg temperature", num(environment.temp.avg, " °C")],
    ["Avg humidity", num(environment.humidity.avg, " %")],
    ["Temp readings in range", num(environment.tempInRangePct, "%")],
    ["Humidity readings in range", num(environment.humidityInRangePct, "%")],
    ["Sensor readings logged", num(environment.count)],
    ["Data coverage", num(coverage.pct, "%")],
    ["Fertility rate", num(hatch.fertilityRate, "%")],
    ["Hatch of fertile", num(hatch.hatchOfFertile, "%")],
    ["Dead in shell", num(hatch.deadInShell)],
    ["Energy logged (estimate)", `${num(energy.totalKwh)} kWh`],
    ["Energy cost (estimate)", `${DEFAULT_CURRENCY}${num(energy.totalCost)}`],
    ["Projected full-window energy", energy.projectedKwh === null ? DASH : `${energy.projectedKwh} kWh`],
    ["Sensor health", num(sensors.healthyPct, "%")],
    ["Suspect readings", String(sensors.issues.length)],
    ["Notes", meta.notes || DASH],
  ];
}

const environmentRows = (report) =>
  report.environment.series.map((row) => [
    fmtDateTime(row.at),
    num(row.temp),
    num(row.humidity),
    row.waterLow === true ? "Low" : row.waterLow === false ? "OK" : DASH,
  ]);

const actuatorSummaryRows = (report) =>
  report.actuators.perActuator.map((a) => [
    a.label,
    String(a.cycles),
    formatDuration(a.runtimeMs),
    num(a.runtimePct, "%"),
  ]);

const actuatorEventRows = (report) =>
  report.actuators.events.map((e) => [fmtDateTime(e.at), e.label, e.state ? "ON" : "OFF"]);

const scanRoundRows = (report) =>
  report.scans.byRound.map((round) => [
    `Round ${round.round || DASH}`,
    String(round.total),
    Object.entries(round.classes)
      .map(([cls, count]) => `${cls}: ${count}`)
      .join(", ") || DASH,
    round.avgConfidence === null ? DASH : `${Math.round(round.avgConfidence * 100)}%`,
  ]);

const scanItemRows = (report) =>
  report.scans.items.map((scan) => [
    fmtDateTime(scan.at),
    String(scan.round || DASH),
    scan.layer1Class || DASH,
    scan.layer2Class || DASH,
    scan.layer1Confidence === null ? DASH : `${Math.round(scan.layer1Confidence * 100)}%`,
  ]);

const alertRows = (report) =>
  report.alerts.items.map((alert) => [
    fmtDateTime(alert.at),
    alert.type || DASH,
    alert.title || DASH,
    alert.message || DASH,
  ]);

/** Build and download the multi-section PDF. */
export function exportBatchReportPdf(report) {
  if (!report) return;
  const pdf = new jsPDF();
  const { meta } = report;

  pdf.setFontSize(15);
  pdf.text("Eggcubator — Batch Report", 14, 16);
  pdf.setFontSize(9);
  pdf.text(`Batch: ${meta.batchId || meta.docId || DASH}`, 14, 23);
  pdf.text(`Device: ${meta.deviceName || meta.deviceId || DASH}`, 14, 28);
  pdf.text(`Window: ${fmtDateTime(meta.startDate)} → ${fmtDateTime(meta.endDate)}`, 14, 33);
  pdf.text(`Generated: ${new Date(report.generatedAt).toLocaleString()}`, 14, 38);

  if (report.coverage.pct !== null && report.coverage.pct < 100) {
    pdf.setTextColor(180, 83, 9);
    pdf.text(
      `Data coverage ${report.coverage.pct}% — ${report.coverage.actualReadings} of ~${report.coverage.expectedReadings} expected readings were logged.`,
      14,
      44
    );
    pdf.setTextColor(0, 0, 0);
  }

  autoTable(pdf, {
    startY: 50,
    head: [["Summary", ""]],
    body: summaryRows(report),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [0, 74, 135] },
  });

  const section = (title, head, body, emptyText) => {
    const startY = pdf.lastAutoTable.finalY + 8;
    pdf.setFontSize(11);
    pdf.text(title, 14, startY);
    if (!body.length) {
      autoTable(pdf, {
        startY: startY + 4,
        body: [[emptyText]],
        styles: { fontSize: 8, textColor: [120, 120, 120] },
      });
      return;
    }
    autoTable(pdf, {
      startY: startY + 4,
      head: [head],
      body,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 74, 135] },
    });
  };

  section(
    "Environment Readings",
    ["Timestamp", "Temp (°C)", "Humidity (%)", "Water"],
    environmentRows(report),
    "No sensor readings logged for this window."
  );
  section(
    "Actuator Runtime",
    ["Actuator", "Cycles", "Runtime", "% of window"],
    actuatorSummaryRows(report),
    "No actuator activity recorded."
  );
  section(
    "Actuator Events",
    ["Timestamp", "Actuator", "Event"],
    actuatorEventRows(report),
    "No actuator events recorded."
  );
  section(
    "Candling Rounds",
    ["Round", "Scans", "Classes", "Avg confidence"],
    scanRoundRows(report),
    "No candling scans recorded for this batch."
  );
  section(
    "Candling Scans",
    ["Timestamp", "Round", "Class", "Sub-class", "Confidence"],
    scanItemRows(report),
    "No candling scans recorded for this batch."
  );
  section(
    "Alerts & Notifications",
    ["Timestamp", "Type", "Title", "Message"],
    alertRows(report),
    "No alerts raised during this window."
  );
  section(
    "Power Consumption (estimated)",
    ["Actuator", "Rated W", "Runtime", "kWh", "Cost"],
    powerRows(report),
    "No actuator runtime recorded."
  );
  section(
    "Suspect Sensor Readings",
    ["Timestamp", "Reading", "Type", "Detail"],
    sensorIssueRows(report),
    "No implausible readings detected."
  );

  pdf.save(`BatchReport_${fileStamp(report)}.pdf`);
}

/** Build and download the workbook — one sheet per report section. */
export function exportBatchReportExcel(report) {
  if (!report) return;
  const wb = XLSX.utils.book_new();

  const sheet = (name, header, rows) => {
    const data = rows.length ? [header, ...rows] : [header];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), name);
  };

  sheet("Summary", ["Field", "Value"], summaryRows(report));
  sheet("Environment", ["Timestamp", "Temp (C)", "Humidity (%)", "Water"], environmentRows(report));
  sheet("Actuator Runtime", ["Actuator", "Cycles", "Runtime", "% of window"], actuatorSummaryRows(report));
  sheet("Actuator Events", ["Timestamp", "Actuator", "Event"], actuatorEventRows(report));
  sheet("Candling Rounds", ["Round", "Scans", "Classes", "Avg confidence"], scanRoundRows(report));
  sheet("Candling Scans", ["Timestamp", "Round", "Class", "Sub-class", "Confidence"], scanItemRows(report));
  sheet("Alerts", ["Timestamp", "Type", "Title", "Message"], alertRows(report));
  sheet("Power", ["Actuator", "Rated W", "Runtime", "kWh", "Cost"], powerRows(report));
  sheet("Sensor Issues", ["Timestamp", "Reading", "Type", "Detail"], sensorIssueRows(report));

  XLSX.writeFile(wb, `BatchReport_${fileStamp(report)}.xlsx`);
}
