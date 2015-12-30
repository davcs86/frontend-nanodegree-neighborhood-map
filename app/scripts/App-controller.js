/*eslint no-unused-vars: [2, { "args": "all", "argsIgnorePattern": "NgMap" }]*/
(function () {
    'use strict';
    angular
    .module('NeighborhoodMap', [
        'ngAnimate',
        'ngAria',
        'ngMessages',
        'ngMaterial',
        'ngMap'
    ])
    .controller('AppController', AppController);

    AppController.$inject = ['$timeout', '$mdSidenav'];

    function AppController ($timeout, $mdSidenav, NgMap) {
        var vm = this;
        vm.toggleLeft = buildDelayedToggler('left');
        /**
         * Supplies a function that will continue to operate until the
         * time is up.
         */
        function debounce(func, wait) {
            var timer;
            return function debounced() {
                var context = vm,
                    args = Array.prototype.slice.call(arguments);
                $timeout.cancel(timer);
                timer = $timeout(function() {
                    timer = undefined;
                    func.apply(context, args);
                }, wait || 10);
            };
        }
        /**
         * Build handler to open/close a SideNav; when animation finishes
         * report completion in console
         */
        function buildDelayedToggler(navID) {
            return debounce(function() {
                $mdSidenav(navID)
                .toggle();
            }, 200);
        }
    }

})();
