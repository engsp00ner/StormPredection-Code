let pressureChart = null;
let temperatureChart = null;
let reconnectTimeout = null;
let recentAlerts = [];

const thresholdLinePlugin = {
    id: "thresholdLinePlugin",
    afterDraw(chart, _args, options) {
        const config = options?.lines || [];
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales.y) {
            return;
        }

        config.forEach((line) => {
            const y = scales.y.getPixelForValue(line.value);
            ctx.save();
            ctx.strokeStyle = line.color;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(chartArea.left, y);
            ctx.lineTo(chartArea.right, y);
            ctx.stroke();
            ctx.restore();
        });
    },
};

function baseChartConfig(label, labels, data, thresholds) {
    return {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label,
                    data,
                    borderColor: "#0d6efd",
                    backgroundColor: "rgba(13, 110, 253, 0.12)",
                    fill: true,
                    tension: 0.25,
                    pointRadius: 2,
                    pointHoverRadius: 4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                thresholdLinePlugin: {
                    lines: thresholds,
                },
            },
            scales: {
                x: {
                    grid: { color: "rgba(0, 0, 0, 0.06)" },
                },
                y: {
                    grid: { color: "rgba(0, 0, 0, 0.06)" },
                },
            },
        },
        plugins: [thresholdLinePlugin],
    };
}

function initPressureChart(labels, data, highThreshold, lowThreshold) {
    const canvas = document.getElementById("pressure-chart");
    if (!canvas) {
        return null;
    }
    pressureChart = new Chart(
        canvas,
        baseChartConfig("Pressure (hPa)", labels, data, [
            { value: highThreshold, color: "#dc3545" },
            { value: lowThreshold, color: "#ffc107" },
        ]),
    );
    return pressureChart;
}

function initTemperatureChart(labels, data, highThreshold, lowThreshold) {
    const canvas = document.getElementById("temperature-chart");
    if (!canvas) {
        return null;
    }
    temperatureChart = new Chart(
        canvas,
        baseChartConfig("Temperature (C)", labels, data, [
            { value: highThreshold, color: "#dc3545" },
            { value: lowThreshold, color: "#0dcaf0" },
        ]),
    );
    return temperatureChart;
}

function setConnectionIndicator(state) {
    const indicator = document.getElementById("ws-indicator");
    if (!indicator) {
        return;
    }
    indicator.classList.remove("ws-dot--green", "ws-dot--grey");
    indicator.classList.add(state === "connected" ? "ws-dot--green" : "ws-dot--grey");
}

function updateRiskCard(prediction, status) {
    const riskCard = document.querySelector(".risk-card");
    const riskLevel = document.getElementById("risk-level");
    const riskDetail = document.getElementById("risk-detail");
    const riskBadge = document.getElementById("risk-badge");

    if (!riskCard || !riskLevel || !riskDetail || !riskBadge) {
        return;
    }

    riskCard.classList.remove("risk-card--low", "risk-card--medium", "risk-card--high", "risk-card--neutral");
    riskBadge.className = "badge severity-badge";

    if (!prediction) {
        riskCard.classList.add("risk-card--neutral");
        riskLevel.textContent = status === "model_unavailable" ? "MODEL UNAVAILABLE" : "BUFFERING";
        riskDetail.textContent = status === "model_unavailable"
            ? "Prediction engine is not available."
            : "Waiting for enough readings.";
        riskBadge.classList.add("bg-secondary-subtle", "text-secondary-emphasis");
        riskBadge.textContent = riskLevel.textContent;
        return;
    }

    const level = prediction.risk_level || "LOW";
    const probability = prediction.storm_probability ?? 0;
    const levelClass = level.toLowerCase();
    riskCard.classList.add(`risk-card--${levelClass}`);
    riskLevel.textContent = level;
    riskDetail.textContent = `Storm probability ${(probability * 100).toFixed(1)}%`;
    riskBadge.classList.add(`severity-badge--${levelClass}`);
    riskBadge.textContent = level;
}

function renderRecentAlerts(alerts) {
    recentAlerts = alerts.slice(0, 5);
    const table = document.querySelector("#recent-alerts tbody");
    if (!table) {
        return;
    }
    if (!recentAlerts.length) {
        table.innerHTML = '<tr><td colspan="4" class="text-secondary">No alerts yet.</td></tr>';
        return;
    }

    table.innerHTML = recentAlerts.map((alert) => `
        <tr>
            <td>${new Date(alert.created_at).toLocaleString()}</td>
            <td>${alert.rule_type}</td>
            <td><span class="badge severity-badge severity-badge--${alert.severity.toLowerCase()}">${alert.severity}</span></td>
            <td>${alert.whatsapp_status}</td>
        </tr>
    `).join("");
}

function appendChartPoint(pressureChartRef, temperatureChartRef, reading) {
    const label = new Date(reading.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (pressureChartRef) {
        pressureChartRef.data.labels.push(label);
        pressureChartRef.data.datasets[0].data.push(reading.pressure_hPa);
        if (pressureChartRef.data.labels.length > 500) {
            pressureChartRef.data.labels.shift();
            pressureChartRef.data.datasets[0].data.shift();
        }
        pressureChartRef.update();
    }
    if (temperatureChartRef) {
        temperatureChartRef.data.labels.push(label);
        temperatureChartRef.data.datasets[0].data.push(reading.temperature_C);
        if (temperatureChartRef.data.labels.length > 500) {
            temperatureChartRef.data.labels.shift();
            temperatureChartRef.data.datasets[0].data.shift();
        }
        temperatureChartRef.update();
    }
}

async function loadInitialData() {
    const [readingsResp, latestPredictionResp, alertsResp] = await Promise.all([
        fetch("/api/v1/readings/?hours=24&limit=500"),
        fetch("/api/v1/predictions/latest/"),
        fetch("/api/v1/alerts/?limit=5"),
    ]);

    const readingsData = await readingsResp.json();
    const latestPrediction = await latestPredictionResp.json();
    const alertsData = await alertsResp.json();

    const labels = readingsData.readings.map((reading) =>
        new Date(reading.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    );
    initPressureChart(labels, readingsData.readings.map((reading) => reading.pressure_hPa), PRESSURE_HIGH, PRESSURE_LOW);
    initTemperatureChart(labels, readingsData.readings.map((reading) => reading.temperature_C), TEMP_HIGH, TEMP_LOW);

    updateRiskCard(
        latestPrediction.status === "no_predictions" ? null : latestPrediction,
        latestPrediction.status || "ok",
    );
    renderRecentAlerts(alertsData.alerts || []);
}

function connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws/dashboard/`);

    socket.addEventListener("open", () => {
        setConnectionIndicator("connected");
    });

    socket.addEventListener("message", (event) => {
        const payload = JSON.parse(event.data);
        appendChartPoint(pressureChart, temperatureChart, payload.reading);
        updateRiskCard(payload.prediction, payload.prediction_status);
        if (payload.alerts && payload.alerts.length) {
            renderRecentAlerts([
                ...payload.alerts.map((alert) => ({
                    ...alert,
                    created_at: new Date().toISOString(),
                    whatsapp_status: "PENDING",
                })),
                ...recentAlerts,
            ]);
        }
    });

    socket.addEventListener("close", () => {
        setConnectionIndicator("disconnected");
        reconnectTimeout = window.setTimeout(connectWebSocket, 3000);
    });

    socket.addEventListener("error", () => {
        socket.close();
    });
}
