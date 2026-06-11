import { config } from "./config";

type OpenMeteoDaily = {
  weather_code?: number[];
  precipitation_probability_max?: number[];
  precipitation_sum?: number[];
  temperature_2m_max?: number[];
};

type OpenMeteoResponse = {
  daily?: OpenMeteoDaily;
};

function firstNumber(values: number[] | undefined) {
  return Array.isArray(values) && typeof values[0] === "number" ? values[0] : null;
}

function isRainCode(code: number | null) {
  return code !== null && ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99));
}

function isSnowCode(code: number | null) {
  return code !== null && ((code >= 71 && code <= 77) || code === 85 || code === 86);
}

function buildWeatherNote(daily: OpenMeteoDaily) {
  const code = firstNumber(daily.weather_code);
  const precipitationProbability = firstNumber(daily.precipitation_probability_max);
  const precipitation = firstNumber(daily.precipitation_sum);
  const maxTemperature = firstNumber(daily.temperature_2m_max);

  if (isSnowCode(code)) return "❄️ 雪予報です。足元に気をつけて。";
  if (isRainCode(code) || (precipitation ?? 0) >= 1 || (precipitationProbability ?? 0) >= 50) {
    return "☔ 雨予報です。送迎お気をつけて。";
  }
  if ((maxTemperature ?? 0) >= 30) return "🥵 暑くなりそうです。水分補給も忘れずに。";
  if (maxTemperature !== null && maxTemperature <= 5) return "🧥 冷え込みそうです。暖かくして送迎しましょう。";
  if (code === 0 || code === 1) return "☀️ 晴れ予報です。今日も送迎お気をつけて。";
  return "🌤️ 今日も送迎お気をつけて。";
}

export async function getMorningWeatherNote(date: string) {
  if (!config.weatherLatitude || !config.weatherLongitude) {
    return "🌤️ 今日も送迎お気をつけて。";
  }

  const params = new URLSearchParams({
    latitude: config.weatherLatitude,
    longitude: config.weatherLongitude,
    daily: "weather_code,precipitation_probability_max,precipitation_sum,temperature_2m_max",
    timezone: "Asia/Tokyo",
    start_date: date,
    end_date: date
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
    if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
    const data = (await response.json()) as OpenMeteoResponse;
    if (!data.daily) return "🌤️ 今日も送迎お気をつけて。";
    return buildWeatherNote(data.daily);
  } catch (error) {
    console.error("[weather failed]", error instanceof Error ? error.message : String(error));
    return "🌤️ 今日も送迎お気をつけて。";
  }
}
