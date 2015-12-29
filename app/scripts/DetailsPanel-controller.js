(function () {
    'use strict';
    angular
    .module('NeighborhoodMap')
    .controller('DetailsPanelController', DetailsPanelController);
    DetailsPanelController.$inject = ['$timeout', '$mdSidenav'];
    function DetailsPanelController ($timeout, $mdSidenav) {
        var vm = this;
        vm.close = function () {
            $mdSidenav('right').close();
        };
    }
})();
