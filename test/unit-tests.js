var assert = require('assert');
var should = require('should');
var _ = require('lodash') ;
var Alerter = require('..') ;
var PagerDutyMock = require('./mocks/pagerduty') ;

Alerter.PagerDutyService = PagerDutyMock ;

describe('Alerter', function(){
  it('constructor should throw if no params provided', function(){
    (function() {
      var alerter = new Alerter() ;
    }).should.throw() ;
  }) ;

  it('constructor should not throw when minimal params provided', function() {
    (function() {
      var alerter = new Alerter({
        serviceKeys: ['your-key-here', 'your-other-key-here']
      }) ;
    }).should.not.throw() ;
  }) ;

  it('should send an alert for a non-configured event', function(done) {
    var alerter = new Alerter({ serviceKeys: ['dummy-key']}) ;
    alerter.alert('UNKNOWN-EVENT', function(err, results) {
      if( err ) { return done(err); }
      results['sent'].should.equal(1);
      done(null) ;
    }) ;
  }) ;

  it('should send an alert for a configured event', function(done) {
    var alerter = new Alerter({ 
      serviceKeys: ['dummy-key'],
      events: [
        {
          name: 'KNOWN-EVENT',
          description: 'this is a known alert'
        }
      ]
    }) ;
    alerter.alert('KNOWN-EVENT', function(err, results) {
      if( err ) { return done(err); }
      should.exist( results.event.description );
      done(null) ;
    }) ;
  }) ;

  it('should send to multiple destinations', function(done) {
    var alerter = new Alerter({ serviceKeys: ['dummy-key1', 'dummy-key2']}) ;
    alerter.alert('UNKNOWN-EVENT', function(err, results) {
      if( err ) { return done(err); }
      results.sent.should.equal(2);
      done(null) ;
    }) ;
  }) ;

  it('should be able to filter alerts based on severity', function(done) {
    var alerter = new Alerter({ 
      serviceKeys: ['dummy-key1', {level: 2, keys: ['dummy-key2', 'dummy-key3']}],
      events: [
        {
          name: 'KNOWN-EVENT',
          description: 'this is a known alert'
        }
      ]
    }) ;
    alerter.alert('KNOWN-EVENT', function(err, results) {
      if( err ) { return done(err); }
      results.sent.should.equal(1);

      alerter.alert('KNOWN-EVENT', {level: 1}, function(err, results) {
        if( err ) { return done(err); }
        results.sent.should.equal(1);

        alerter.alert('KNOWN-EVENT', {level: 2}, function(err, results) {
          if( err ) { return done(err); }
          results.sent.should.equal(3);

          alerter.alert('KNOWN-EVENT', {level: 3}, function(err, results) {
            if( err ) { return done(err); }
            results.sent.should.equal(3);
            done(null) ;
          }) ;
        }) ;
      }) ;
    }) ;    
  }) ;

  it('should throttle', function(done) {
    this.timeout(2000) ;
    var alerter = new Alerter({ 
      serviceKeys: ['dummy-key'],
      events: [
        {
          name: 'KNOWN-EVENT',
          description: 'this is a known alert',
          throttle: '1 sec'
        }
      ]
    }) ;

    // first alert should be sent
    alerter.alert('KNOWN-EVENT', function(err, results) {
      if( err ) { return done(err); }
      results.throttled.should.equal(false) ;
      results.sent.should.equal(1);

      // second alert should get throttled
      alerter.alert('KNOWN-EVENT', function(err, results) {
        if( err ) { return done(err); }
        results.throttled.should.equal(true) ;
        results.sent.should.equal(0) ;

        // after time passes the third alert should be sent
        setTimeout( function() {
          alerter.alert('KNOWN-EVENT', function(err, results) {
            if( err ) { return done(err); }
            results.throttled.should.equal(false) ;
            results.sent.should.equal(1);
            done(null) ;
          }) ;
        }, 1100) ;        
      }) ;
    }) ;
  }) ;

  it('should be able to automatically resolve an incident', function(done) {
    var alerter = new Alerter({ 
      serviceKeys: ['dummy-key'],
      events: [
        {
          name: 'LOST-CONNECTION',
          description: 'I lost my connection!'
        },
        {
          name: 'GAINED-CONNECTION',
          description: 'Whew!...I\'m back.',
          resolves: 'LOST-CONNECTION',
          notify: false
        }        
      ]
    }) ;
    alerter.alert('LOST-CONNECTION', {
      target: 'my-database-connection'
    }, function(err, results) {
      if( err ) { return done(err); }
      results.sent.should.equal(1);
      alerter._incidents['LOST-CONNECTION']['my-database-connection'].length.should.equal(1) ;

      alerter.alert('GAINED-CONNECTION', {
        target: 'my-database-connection'
      }, function(err, results) {
        if( err ) { return done(err); }
        results.sent.should.equal(0);
        results.resolved.should.equal(1);
        should.not.exist(alerter._incidents['LOST-CONNECTION']['my-database-connection']) ;
        done(null) ;
      }) ;
    }) ;
  }) ;

  it('should be able to automatically resolve an incident with a default target', function(done) {
    var alerter = new Alerter({ 
      serviceKeys: ['dummy-key'],
      events: [
        {
          name: 'LOST-CONNECTION',
          description: 'I lost my connection!'
        },
        {
          name: 'GAINED-CONNECTION',
          description: 'Whew!...I\'m back.',
          resolves: 'LOST-CONNECTION',
          notify: false
        }        
      ]
    }) ;
    alerter.alert('LOST-CONNECTION', function(err, results) {
      if( err ) { return done(err); }
      results.sent.should.equal(1);
      alerter._incidents['LOST-CONNECTION']['default'].length.should.equal(1) ;

      alerter.alert('GAINED-CONNECTION', function(err, results) {
        if( err ) { return done(err); }
        results.sent.should.equal(0);
        results.resolved.should.equal(1);
        should.not.exist(alerter._incidents['LOST-CONNECTION']['default']) ;
        done(null) ;
      }) ;
    }) ;
  }) ;

  it('should be able to automatically resolve multiple incidents at once', function(done) {
    var alerter = new Alerter({ 
      serviceKeys: ['dummy-key'],
      events: [
        {
          name: 'LOST-CONNECTION',
          description: 'I lost my connection!'
        },
        {
          name: 'GAINED-CONNECTION',
          description: 'Whew!...I\'m back.',
          resolves: 'LOST-CONNECTION',
          notify: false
        }        
      ]
    }) ;

    // send one alert
    alerter.alert('LOST-CONNECTION', {
      target: 'my-database-connection'
    }, function(err, results) {
      if( err ) { return done(err); }
      results.sent.should.equal(1);
      alerter._incidents['LOST-CONNECTION']['my-database-connection'].length.should.equal(1) ;

      // repeat the same alert
      alerter.alert('LOST-CONNECTION', {
        target: 'my-database-connection'
      }, function(err, results) {
        if( err ) { return done(err); }
        results.sent.should.equal(1);
        alerter._incidents['LOST-CONNECTION']['my-database-connection'].length.should.equal(2) ;

        // resolve them both
        alerter.alert('GAINED-CONNECTION', {
          target: 'my-database-connection'
        }, function(err, results) {
          if( err ) { return done(err); }
          results.sent.should.equal(0);
          results.resolved.should.equal(2);
          should.not.exist(alerter._incidents['LOST-CONNECTION']['my-database-connection']) ;
          done(null) ;
        }) ;
      }); 
    }) ;
  }) ;


}) ;