// script.js
const LAT = 5.6037;
const LON = -0.187;
const API_KEY = "YOUR_OPENWEATHER_API_KEY"; // Get a free API key from https://openweathermap.org/api
const WEATHER_API = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m&timezone=auto`;
const AQI_API = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}&current=us_aqi&domains=auto&timezone=auto`;

const alertsDiv = document.getElementById("alerts");

function computeAQI(pm25) {
  const breakpoints = [
    { loI: 0, hiI: 50, loC: 0.0, hiC: 12.0 },
    { loI: 51, hiI: 100, loC: 12.1, hiC: 35.4 },
    { loI: 101, hiI: 150, loC: 35.5, hiC: 55.4 },
    { loI: 151, hiI: 200, loC: 55.5, hiC: 150.4 },
    { loI: 201, hiI: 300, loC: 150.5, hiC: 250.4 },
    { loI: 301, hiI: 500, loC: 250.5, hiC: 500.4 },
  ];

  for (let bp of breakpoints) {
    if (pm25 >= bp.loC && pm25 <= bp.hiC) {
      return Math.round(
        bp.loI + ((bp.hiI - bp.loI) * (pm25 - bp.loC)) / (bp.hiC - bp.loC)
      );
    }
  }
  return 500; // Hazardous
}

function updateStatus(element, value, thresholds, labels) {
  let status = "good";
  let label = labels[0];

  if (value > thresholds[1]) {
    status = "poor";
    label = labels[2];
  } else if (value > thresholds[0]) {
    status = "moderate";
    label = labels[1];
  }

  element.querySelector(".value").textContent = value;
  element.querySelector(".status").textContent = label;
  element.querySelector(".status").className = `status ${status}`;
}

function checkAlert(condition, message, type = "warning") {
  if (condition) {
    const alertEl = document.createElement("div");
    alertEl.className = `alert ${type}`;
    alertEl.textContent = message;
    alertsDiv.appendChild(alertEl);
  }
}

function clearAlerts() {
  alertsDiv.innerHTML = "";
}

async function fetchCurrentData() {
  try {
    // Fetch weather data
    const weatherRes = await fetch(WEATHER_API);
    const weatherData = await weatherRes.json();
    const temp = weatherData.current.temperature_2m;
    const humidity = weatherData.current.relative_humidity_2m;

    // Update temperature
    updateStatus(
      document.getElementById("temperature"),
      temp.toFixed(1),
      [20, 35],
      ["Cool", "Warm", "Hot"]
    );

    // Update humidity
    updateStatus(
      document.getElementById("humidity"),
      humidity.toFixed(1),
      [40, 70],
      ["Dry", "Comfortable", "Humid"]
    );

    // Fetch AQI data
    const aqiRes = await fetch(AQI_API);
    const aqiData = await aqiRes.json();
    const aqi = Math.round(aqiData.current.us_aqi);

    // Update AQI
    updateStatus(
      document.getElementById("aqi"),
      aqi,
      [50, 100],
      ["Good", "Moderate", "Unhealthy"]
    );

    // Check alerts
    clearAlerts();
    checkAlert(temp > 35, "High temperature alert: Stay hydrated!", "danger");
    checkAlert(
      humidity > 80,
      "High humidity alert: Risk of discomfort.",
      "warning"
    );
    checkAlert(
      aqi > 100,
      "Poor air quality alert: Limit outdoor activities.",
      "danger"
    );

    if (alertsDiv.children.length === 0) {
      const noAlert = document.createElement("div");
      noAlert.className = "alert";
      noAlert.textContent = "All conditions are safe.";
      alertsDiv.appendChild(noAlert);
    }
  } catch (error) {
    console.error("Error fetching data:", error);
    alertsDiv.innerHTML =
      '<div class="alert danger">Error loading data. Please try again.</div>';
  }
}

async function fetchHistorical() {
  const today = new Date();
  const endDate = today.toISOString().split("T")[0];
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 7);
  const startDateStr = startDate.toISOString().split("T")[0];

  const weatherURL = `https://archive-api.open-meteo.com/v1/archive?latitude=${LAT}&longitude=${LON}&start_date=${startDateStr}&end_date=${endDate}&daily=temperature_2m_max&timezone=auto`;
  const humidityURL = `https://archive-api.open-meteo.com/v1/archive?latitude=${LAT}&longitude=${LON}&start_date=${startDateStr}&end_date=${endDate}&hourly=relative_humidity_2m&timezone=auto`;

  try {
    const weatherRes = await fetch(weatherURL);
    const weatherData = await weatherRes.json();
    const temps = weatherData.daily.temperature_2m_max;
    const dates = weatherData.daily.time;

    // Fetch humidity hourly
    const humRes = await fetch(humidityURL);
    const humData = await humRes.json();
    const hourlyTimes = humData.hourly.time;
    const hourlyHum = humData.hourly.relative_humidity_2m;

    // Group by date and compute mean
    const dailyHum = {};
    for (let i = 0; i < hourlyTimes.length; i++) {
      const date = hourlyTimes[i].split("T")[0];
      if (!dailyHum[date]) dailyHum[date] = [];
      dailyHum[date].push(hourlyHum[i]);
    }

    const humMeans = dates.map((date) => {
      const values = dailyHum[date] || [];
      return values.length > 0
        ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)
        : 0;
    });

    // Fetch historical AQI from OpenWeather
    let aqiDaily = new Array(dates.length).fill(0);
    if (API_KEY && API_KEY !== "YOUR_OPENWEATHER_API_KEY") {
      const startUnix = Math.floor(startDate.getTime() / 1000);
      const endUnix = Math.floor(today.getTime() / 1000);
      const aqiURL = `https://api.openweathermap.org/data/2.5/air_pollution/history?lat=${LAT}&lon=${LON}&start=${startUnix}&end=${endUnix}&appid=${API_KEY}`;
      const aqiRes = await fetch(aqiURL);
      if (aqiRes.ok) {
        const aqiData = await aqiRes.json();
        const hourlyAqi = aqiData.list || [];
        const dailyPm25 = {};
        for (let item of hourlyAqi) {
          const dateStr = new Date(item.dt * 1000).toISOString().split("T")[0];
          if (!dailyPm25[dateStr]) dailyPm25[dateStr] = [];
          dailyPm25[dateStr].push(item.components.pm2_5);
        }
        aqiDaily = dates.map((date) => {
          const pm25s = dailyPm25[date] || [];
          if (pm25s.length === 0) return 0;
          const avgPm25 = pm25s.reduce((a, b) => a + b, 0) / pm25s.length;
          return computeAQI(avgPm25);
        });
      }
    }

    // Create chart
    const ctx = document.getElementById("historicalChart").getContext("2d");
    new Chart(ctx, {
      type: "line",
      data: {
        labels: dates,
        datasets: [
          {
            label: "Max Temperature (°C)",
            data: temps,
            borderColor: "rgb(255, 99, 132)",
            backgroundColor: "rgba(255, 99, 132, 0.2)",
            yAxisID: "y",
          },
          {
            label: "Average Humidity (%)",
            data: humMeans,
            borderColor: "rgb(54, 162, 235)",
            backgroundColor: "rgba(54, 162, 235, 0.2)",
            yAxisID: "y1",
          },
          {
            label: "Average AQI",
            data: aqiDaily,
            borderColor: "rgb(153, 102, 255)",
            backgroundColor: "rgba(153, 102, 255, 0.2)",
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            type: "linear",
            display: true,
            position: "left",
          },
          y1: {
            type: "linear",
            display: true,
            position: "right",
            grid: {
              drawOnChartArea: false,
            },
          },
        },
      },
    });
  } catch (error) {
    console.error("Error fetching historical data:", error);
  }
}

// Fetch current data on load and every 5 minutes
fetchCurrentData();
setInterval(fetchCurrentData, 5 * 60 * 1000);

// Fetch historical data once on load
fetchHistorical();

