/** MyTree — Indian cities used for demo data, geofence checks and region drill-downs. */
(function () {
  'use strict';
  var MT = window.MT;
  MT.geoData = {
    /** name, state, lat, lng, radius (km) used for "outside declared city" geofence warnings */
    cities: [
      { name: 'Pune', state: 'Maharashtra', lat: 18.5204, lng: 73.8567, r: 35 },
      { name: 'Mumbai', state: 'Maharashtra', lat: 19.076, lng: 72.8777, r: 40 },
      { name: 'Nagpur', state: 'Maharashtra', lat: 21.1458, lng: 79.0882, r: 30 },
      { name: 'Nashik', state: 'Maharashtra', lat: 19.9975, lng: 73.7898, r: 25 },
      { name: 'Delhi', state: 'Delhi', lat: 28.6139, lng: 77.209, r: 45 },
      { name: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lng: 77.5946, r: 40 },
      { name: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2707, r: 35 },
      { name: 'Hyderabad', state: 'Telangana', lat: 17.385, lng: 78.4867, r: 40 },
      { name: 'Kolkata', state: 'West Bengal', lat: 22.5726, lng: 88.3639, r: 35 },
      { name: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lng: 75.7873, r: 30 },
      { name: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lng: 72.5714, r: 35 },
      { name: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2599, lng: 77.4126, r: 25 },
      { name: 'Kochi', state: 'Kerala', lat: 9.9312, lng: 76.2673, r: 25 },
      { name: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lng: 80.9462, r: 30 }
    ],
    states: ['Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Other'],
    /** Approximate state / UT centroids for region circles. */
    stateCentroids: { 'Andhra Pradesh': [15.9, 79.7], 'Assam': [26.2, 92.9], 'Bihar': [25.7, 85.6], 'Chhattisgarh': [21.3, 81.9], 'Delhi': [28.6, 77.2], 'Goa': [15.4, 74.0], 'Gujarat': [22.3, 71.7], 'Haryana': [29.1, 76.1], 'Himachal Pradesh': [31.9, 77.2], 'Jharkhand': [23.6, 85.3], 'Karnataka': [14.6, 75.7], 'Kerala': [10.5, 76.5], 'Madhya Pradesh': [23.5, 78.3], 'Maharashtra': [19.4, 76.0], 'Odisha': [20.5, 84.4], 'Punjab': [31.0, 75.4], 'Rajasthan': [26.6, 73.8], 'Tamil Nadu': [11.1, 78.7], 'Telangana': [17.9, 79.1], 'Uttar Pradesh': [26.8, 80.9], 'Uttarakhand': [30.1, 79.2], 'West Bengal': [23.0, 87.9], 'Other': [22.0, 79.0] },
    city: function (name) { return MT.geoData.cities.filter(function (c) { return c.name === name; })[0]; },
    slug: function (s) { return String(s || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  };
})();
