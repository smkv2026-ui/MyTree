/**
 * MyTree — translation dictionary. English is complete; Hindi (hi) and Marathi (mr) cover navigation and common
 * actions and fall back to English for anything missing. To add a language: add a block here and an entry in MT.LANGS.
 */
(function () {
  'use strict';
  var MT = window.MT;
  MT.LANGS = [{ code: 'en', label: 'English' }, { code: 'hi', label: 'हिन्दी' }, { code: 'mr', label: 'मराठी' }];
  MT.dict = {
    en: {
      'nav.dashboard': 'Dashboard', 'nav.plant': 'Plant a tree', 'nav.trees': 'My trees', 'nav.map': 'Map', 'nav.updates': 'Updates',
      'nav.people': 'People', 'nav.orgs': 'Organisations', 'nav.bulk': 'Bulk upload', 'nav.leaderboard': 'Leaderboard', 'nav.help': 'Help',
      'nav.admin': 'Command centre', 'nav.approvals': 'Approvals', 'nav.reports': 'Reports', 'nav.audit': 'Audit log', 'nav.badges': 'Badges',
      'nav.more': 'More', 'nav.home': 'Home', 'nav.health': 'Tree health', 'nav.settings': 'Settings', 'nav.green': 'Green cover',
      'common.signin': 'Sign in', 'common.signout': 'Sign out', 'common.register': 'Get started', 'common.search': 'Search or jump to…',
      'common.cancel': 'Cancel', 'common.save': 'Save', 'common.back': 'Back', 'common.soon': 'Soon', 'common.theme': 'Theme',
      'common.language': 'Language', 'common.textsize': 'Text size', 'common.contrast': 'High contrast', 'common.notifications': 'Notifications',
      'hero.title': 'Plant a tree. Keep a friend.', 'hero.sub': 'MyTree helps schools, foundations and families plant, track and nurture trees — one sapling, one story, one friendship with nature at a time.',
      'hero.cta': 'Start planting', 'hero.cta2': 'See the forest'
    },
    hi: {
      'nav.dashboard': 'डैशबोर्ड', 'nav.plant': 'पेड़ लगाएँ', 'nav.trees': 'मेरे पेड़', 'nav.map': 'नक्शा', 'nav.updates': 'अपडेट',
      'nav.people': 'लोग', 'nav.orgs': 'संस्थाएँ', 'nav.bulk': 'थोक अपलोड', 'nav.leaderboard': 'लीडरबोर्ड', 'nav.help': 'सहायता',
      'nav.admin': 'कमांड सेंटर', 'nav.approvals': 'स्वीकृतियाँ', 'nav.reports': 'रिपोर्ट', 'nav.audit': 'ऑडिट लॉग', 'nav.badges': 'बैज',
      'nav.more': 'और', 'nav.home': 'होम',
      'common.signin': 'साइन इन', 'common.signout': 'साइन आउट', 'common.register': 'शुरू करें', 'common.search': 'खोजें या जाएँ…',
      'common.cancel': 'रद्द करें', 'common.save': 'सहेजें', 'common.back': 'वापस', 'common.soon': 'जल्द', 'common.theme': 'थीम',
      'common.language': 'भाषा', 'common.textsize': 'अक्षर का आकार', 'common.contrast': 'उच्च कंट्रास्ट', 'common.notifications': 'सूचनाएँ',
      'hero.title': 'एक पेड़ लगाएँ। एक मित्र बनाएँ।', 'hero.sub': 'MyTree स्कूलों, फ़ाउंडेशनों और परिवारों को पेड़ लगाने, उनकी निगरानी और देखभाल करने में मदद करता है — एक पौधा, एक कहानी, प्रकृति से एक मित्रता।',
      'hero.cta': 'पेड़ लगाना शुरू करें', 'hero.cta2': 'जंगल देखें'
    },
    mr: {
      'nav.dashboard': 'डॅशबोर्ड', 'nav.plant': 'झाड लावा', 'nav.trees': 'माझी झाडे', 'nav.map': 'नकाशा', 'nav.updates': 'अपडेट्स',
      'nav.people': 'लोक', 'nav.orgs': 'संस्था', 'nav.bulk': 'एकत्रित अपलोड', 'nav.leaderboard': 'लीडरबोर्ड', 'nav.help': 'मदत',
      'nav.admin': 'कमांड सेंटर', 'nav.approvals': 'मंजुरी', 'nav.reports': 'अहवाल', 'nav.audit': 'ऑडिट लॉग', 'nav.badges': 'बॅज',
      'nav.more': 'अधिक', 'nav.home': 'मुख्यपृष्ठ',
      'common.signin': 'साइन इन', 'common.signout': 'साइन आउट', 'common.register': 'सुरू करा', 'common.search': 'शोधा किंवा जा…',
      'common.cancel': 'रद्द करा', 'common.save': 'जतन करा', 'common.back': 'मागे', 'common.soon': 'लवकरच', 'common.theme': 'थीम',
      'common.language': 'भाषा', 'common.textsize': 'अक्षराचा आकार', 'common.contrast': 'उच्च कॉन्ट्रास्ट', 'common.notifications': 'सूचना',
      'hero.title': 'एक झाड लावा. एक मित्र मिळवा.', 'hero.sub': 'MyTree शाळा, फाउंडेशन आणि कुटुंबांना झाडे लावण्यास, त्यांचा मागोवा घेण्यास आणि जोपासण्यास मदत करते — एक रोप, एक गोष्ट, निसर्गाशी एक मैत्री.',
      'hero.cta': 'झाडे लावायला सुरुवात करा', 'hero.cta2': 'जंगल पहा'
    }
  };
})();
