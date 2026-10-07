/** MyTree — tiny i18n: MT.t('nav.map'). Falls back to English, then to the key itself. */
(function () {
  'use strict';
  var MT = window.MT;
  MT.lang = MT.storage.get('mt.lang', 'en');
  if (!MT.dict[MT.lang]) MT.lang = 'en';
  document.documentElement.lang = MT.lang;
  MT.t = function (key, fallback) {
    var d = MT.dict[MT.lang] || {};
    return d[key] != null ? d[key] : ((MT.dict.en[key] != null) ? MT.dict.en[key] : (fallback != null ? fallback : key));
  };
  MT.setLang = function (code) {
    if (!MT.dict[code]) return;
    MT.lang = code; MT.storage.set('mt.lang', code); document.documentElement.lang = code;
    MT.store.set('lang', code);
    if (MT.router && MT.router.refresh) { MT.shell.reset(); MT.router.refresh(); }
  };
})();
