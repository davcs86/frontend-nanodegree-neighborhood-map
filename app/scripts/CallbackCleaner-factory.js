(function(){
    // Taken from http://stackoverflow.com/a/25406041/2423859
    'use strict';
    angular
    .module('NeighborhoodMap')
    .factory('jsonpInterceptor', jsonpInterceptorFactory);

    jsonpInterceptorFactory.$inject = ['$timeout', '$window', '$q', '$log'];
    function jsonpInterceptorFactory ($timeout, $window, $q, $log) {
        return {
            'request': function(config) {
                if (config.method === 'JSONP') {
                    var callbackId = angular.callbacks.counter.toString(36);
                    config.callbackName = 'angular_callbacks_' + callbackId;
                    config.url = config.url.replace('JSON_CALLBACK', config.callbackName);
                    $log.log(config);
                    $timeout(function() {
                        $window[config.callbackName] = angular.callbacks['_' + callbackId];
                    }, 0, false);
                }
                return config;
            },
            'response': function(response) {
                var config = response.config;
                if (config.method === 'JSONP') {
                    $log.log('Interceptor: response');
                    $log.log(response);
                    var callbackId = config.callbackName.split('_')[2];
                    delete $window[config.callbackName]; // cleanup
                    $timeout(function() {
                        $window[config.callbackName] = angular.callbacks['_' + callbackId];
                    }, 0, false);
                }
                return response;
            },
            'responseError': function(rejection) {
                var config = rejection.config;
                if (config.method === 'JSONP') {
                    $log.log('Interceptor: error');
                    $log.log(rejection);
                    var callbackId = config.callbackName.split('_')[2];
                    delete $window[config.callbackName]; // cleanup
                    $timeout(function() {
                        $window[config.callbackName] = angular.callbacks['_' + callbackId];
                    }, 0, false);
                }
                return $q.reject(rejection);
            }
        };
    }
})();
