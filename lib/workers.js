"use strict";

var kue = require('kue'),
    Promise = require('bluebird'),
    mongoose = require('mongoose');

var queue;

if (process.env.NODE_ENV !== 'test') {
  queue = kue.createQueue();
  queue.on('job enqueue', function (id, type) {
    console.log('Job %s got queued of type %s', id, type);
  }).on('job complete', function (id) {
    kue.Job.get(id, function (err, job) {
      if (err) return;
      job.remove(function (err) {
        if (err) throw err;
        console.log('Removed completed job #%d', job.id);
      });
    });
  });
} else {
  queue = {
    process: function () { return { save: function() {} }; },
    create: function () { return { save: function () {} }; }
  };
}

module.exports.startFrontend = function (port) {
    kue.app.listen(port);
};

//
//
// Confirmation mail

queue.process('confirmationMail', function (job, done) {
    if (!job.data) {
        done();
    }
    var domain = require('domain').create();
    domain.on('error', function (err) {
        done(err);
    });
    domain.run(function () {
        return mongoose.model('User').findOne({uuid:job.data})
            .then(function (user) {
                if (user.hasOwnProperty('sendConfirmationMail')) {
                    return user.sendConfirmationMail();
                }
            })
            .then(function () {
                done();
            })
            .catch(function (err) {
                done(err);
            });
    });
});

module.exports.sendConfirmationMail = function (user) {
    return Promise.resolve()
        .then(function () {
            var job = queue.create('confirmationMail', user).attempts(10).backoff({delay: 60 * 1000, type: 'fixed'});
            return Promise.promisify(function (cb) {
                job.save(cb);
            })();
        });
};

//
//
// Password reset

queue.process('resetMail', function (job, done) {
    console.log('queue process resetMail', job);
    if (!job.user) {
        done();
    }
    var domain = require('domain').create();
    domain.on('error', function (err) {
        done(err);
    });
    domain.run(function () {
        return mongoose.model('User').findOne({uuid: job.data})
            .then(function (user) {
                console.log('queue process resetMail with user:', user);
                return user.requestPasswordReset();
            })
            .then(function () {
                done();
            })
            .catch(function (err) {
                done(err);
            });
    });
});

module.exports.sendResetMail = function (user) {
    return Promise.resolve()
        .then(function () {
            var job = queue.create('resetMail', user).attempts(10).backoff({delay: 60 * 1000, type: 'fixed'});
            return Promise.promisify(function (cb) {
                job.save(cb);
            })();
        });
};
