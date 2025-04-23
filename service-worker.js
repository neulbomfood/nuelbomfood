const CACHE_NAME = "neulbom-quiz-cache-v1";
const urlsToCache = [
  "index.html",
  "quiz.html",
  "style.css",
  "script.js",
  "questions.json",
  "manifest.json",
  "assets/sounds/correct.mp3",
  "assets/sounds/wrong.mp3",
  "assets/sounds/click.mp3",
  "assets/img/goodjob.png",
  "assets/img/tryagain.png",
  "assets/img/icon-192.png",
  "assets/img/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener("fetch", function (event) {
  event.respondWith(
    caches.match(event.request).then(function (response) {
      return response || fetch(event.request);
    })
  );
});
