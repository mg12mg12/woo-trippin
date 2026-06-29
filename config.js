// 部署時填入(本機開發可不填)。
window.CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbzsnDJ4qAvKr_9Kxbr8jy0TTCjcYJDAwbvwZdqizUpDJFOHSWMeqUt-a9bIwWKN_AhG-w/exec",            // Apps Script Web App 網址(.../exec);本機開發留空
  GOOGLE_CLIENT_ID: "14112994882-6hjkttl09edn4maec9k0u3h65p6vralp.apps.googleusercontent.com",   // Google 登入用 OAuth 用戶端 ID;本機開發留空
  // 行程清單:每個行程 = 一張試算表。新增行程 = 建一張新試算表後,在這裡加一筆。
  TRIPS: [
    // { id: "seoul-0804", name: "首爾行程", subtitle: "Seoul", dateRange: "8/4 – 8/10", days: 7, origin: "TPE", dest: "ICN", spreadsheetId: "17guCKifLAScQaABYCbV6XOQMXuFskm9E" },
  ],
};
