/*global OAuth:true,google*/
(function(){
    'use strict';
    angular
    .module('NeighborhoodMap')
    .factory('locationsFactory', locationsFactory);

    locationsFactory.$inject = ['$http', '$log', '$q', '$window'];

    function locationsFactory($http, $log, $q, $window){
        return {
            searchYelpBusiness: function(placeName, placeLocLat, placeLocLng, placeLocation) {
                var c = $window.angular.callbacks.counter.toString(36),
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
                            callback: 'angular_callbacks_'+c
                        }
                    },
                    oauthToken = {
                        public: 'v3TxAKHJ7jxke9vbVI-CjBnOfVP2f3DZ',
                        secret: 'JWuqPhtTUFsc3k1H0cN5LREpBtA'
                    }
                $window['angularcallbacks_' + c] = function (data) {
                    $window.angular.callbacks['_' + c](data);
                    delete $window['angularcallbacks_' + c];
                };
                return $http.jsonp(request.url, { params:oauth.authorize(request, oauthToken) });
            },
            searchFoursquareBusiness: function(placeName, placeLocLat, placeLocLng, placeLocation) {
                var deferred = $q.defer(),
                    params = {
                        client_id: 'CXKRXUECPPORHVJPSUPCXZU20DCKOBIHNYSISD1LZMZXJJMD',
                        client_secret: 'VNPDWMWMO5GFK1FR23PW1FM5TATJX5XMWGVZF1IFTLBGYHSP',
                        v: 20130815,
                        query: placeName,
                        ll:  placeLocLat+','+placeLocLng,
                        callback: 'angular.callbacks._0',
                        near: placeLocation,
                        limit: 1
                    }
                $http.jsonp('https://api.foursquare.com/v2/venues/search', { params: params })
                    .then(function(result) {
                        $log.log('resolve');
                        //resolve the promise as the data
                        deferred.resolve(result);
                    });
                return deferred.promise;
            },
            getGoogleNearbyPlaces: function(map, bounds) {
                var deferred = $q.defer(),
                    request = {
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
