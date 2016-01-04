/*global OAuth:true,google*/
(function(){
    'use strict';
    angular
    .module('NeighborhoodMap')
    .factory('locationsFactory', locationsFactory);

    locationsFactory.$inject = ['$http', '$log', '$q', '$window', '$timeout'];

    function locationsFactory($http, $log, $q, $window, $timeout){
        return {
            searchYelpBusiness: function(placeId, placeName, placeLocLat, placeLocLng, placeLocation) {
                var deferred = $q.defer(),
                    c = (new Date()).getTime(),
                    oauth = OAuth({
                        consumer: {
                            public: '-0OmC9HI7oxDSZtNxu8sCQ',
                            secret: 'mk6UB3_5uLISj3-9sL_982lOl9M'
                        },
                        signature_method: 'HMAC-SHA1'
                    }),
                    request = {
                        url: 'http://api.yelp.com/v2/search',
                        method: 'GET',
                        data: {
                            limit: 1,
                            term: placeName,
                            cll:  placeLocLat+','+placeLocLng,
                            location: placeLocation,
                            callback: 'yelp_callback_'+c+placeId
                        }
                    },
                    oauthToken = {
                        public: 'v3TxAKHJ7jxke9vbVI-CjBnOfVP2f3DZ',
                        secret: 'JWuqPhtTUFsc3k1H0cN5LREpBtA'
                    }
                var timeout = $timeout(function(){
                    delete $window['yelp_callback_'+c+placeId];
                    deferred.reject('');
                },10000);
                $window['yelp_callback_'+c+placeId] = function (data) {
                    $timeout.cancel(timeout);
                    delete $window['yelp_callback_'+c+placeId];
                    deferred.resolve(data);
                };
                $http.jsonp(request.url, { params: oauth.authorize(request, oauthToken)});
                return deferred.promise;
            },
            searchFoursquareBusiness: function(placeName, placeLocLat, placeLocLng, placeLocation) {
                var params = {
                    client_id: 'CXKRXUECPPORHVJPSUPCXZU20DCKOBIHNYSISD1LZMZXJJMD',
                    client_secret: 'VNPDWMWMO5GFK1FR23PW1FM5TATJX5XMWGVZF1IFTLBGYHSP',
                    v: 20130815,
                    query: placeName,
                    ll: placeLocLat+','+placeLocLng,
                    callback: 'JSON_CALLBACK',
                    near: placeLocation,
                    limit: 1
                }
                return $http.jsonp('https://api.foursquare.com/v2/venues/search', { params: params });
            },
            getGoogleNearbyPlaces: function(map, bounds) {
                var deferred = $q.defer(),
                    request = {
                        location: map.getCenter(),
                        bounds: bounds,
                        types: ['food']
                    },
                    service = new google.maps.places.PlacesService(map);
                $log.log(bounds);
                service.nearbySearch(request, function(results, status) {
                    if (status == google.maps.places.PlacesServiceStatus.OK) {
                        deferred.resolve(results);
                    } else {
                        $log.log(status);
                        deferred.reject();
                    }
                })
                return deferred.promise;
            }
        }
    }
})();
