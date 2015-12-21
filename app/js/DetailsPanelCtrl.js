angular
    .module('NeighborhoodMap', ['ngMaterial'])
    .controller('DetailsPanelCtrl', function ($scope, $timeout, $mdSidenav, $log) {
        $scope.close = function () {
            $mdSidenav('right').close()
            .then(function () {
                $log.debug("close RIGHT is done");
            });
        };
    });
