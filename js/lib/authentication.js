var Q, request,
  __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

request = require('request');

Q = require('q');

module.exports = function(csrf_generator, cache, requestio) {
  var a;
  a = {
    refresh_tokens: function(credentials, session, force) {
      var defer, now;
      defer = Q.defer();
      credentials.refreshed = false;
      now = new Date();
      if (credentials.expires  && (now.getTime() > credentials.expires || force)) {
        request.post({
          url: cache.oauthd_url + cache.oauthd_base + '/refresh_token/' + credentials.provider,
          form: {
            token: credentials.refresh_token || credentials.access_token,
            key: session.public_key,
            secret: session.secret_key
          }
        }, function(e, r, body) {
          var k;
          if (e) {
            defer.reject(e);
            return defer.promise;
          } else {
            if (typeof body === "string") {
              try {
                body = JSON.parse(body);
                if(body.status !== undefined) {
                  if(body.status !== "success") {
                    return defer.reject("error: non-success:" + JSON.stringify(body));
                  } else {
                    body = body.data;
                  }
                }
              } catch (_error) {
                e = _error;
                defer.reject(e);
              }
              if (typeof body === "object" && (body.access_token || (body.oauth_token && body.oauth_token_secret)) && body.expires_in) {
                credentials.expires = new Date().getTime() + body.expires_in * 1000;
                for (k in body) {
                  credentials[k] = body[k];
                }
                if ((session != null)) {
                  session.oauth = session.oauth || {};
                  session.oauth[credentials.provider] = credentials;
                }
                credentials.refreshed = true;
                credentials.last_refresh = new Date().getTime();
                return defer.resolve(credentials);
              } else {
                return defer.reject({"error": "unexpected credentials", "data": body});
              }
            }
          }
        });
      } else {
        defer.resolve(credentials);
      }
      return defer.promise;
    },
    redirect: function(provider, urlToRedirect, req, res) {
      var csrf_token;
      csrf_token = csrf_generator(req.session);
      res.writeHead(302, {
        Location: cache.oauthd_url + cache.oauthd_base + '/' + provider + '?k=' + cache.public_key + '&opts=' + encodeURIComponent(JSON.stringify({
          state: csrf_token
        })) + '&redirect_type=server&redirect_uri=' + encodeURIComponent(urlToRedirect)
      });
      return res.end();
    },
    auth: function(provider, session, opts) {
      var defer;
      defer = Q.defer();
      if (typeof session === "function") {
        return a.redirect(provider, session);
      }
      if (opts != null ? opts.code : void 0) {
        if(opts.public_key && opts.secret_key) {
        	return a.authenticate(opts.code, session, opts.public_key, opts.secret_key);
        } else {
  			defer.reject(('App name and secret not present'));
        }
        return defer.promise;
      }
      if (opts != null ? opts.credentials : void 0) {
        a.refresh_tokens(opts.credentials, session, opts != null ? opts.force_refresh : void 0)
        .then(function(credentials) {
          credentials.public_key = session.public_key;
          credentials.secret_key = session.secret_key;
          return defer.resolve(a.construct_request_object(credentials));
        })
        .fail(defer.reject);
        return defer.promise;
      }
      if ((!(opts != null ? opts.credentials : void 0)) && (!(opts != null ? opts.code : void 0))) {
        if (session.oauth && session.oauth[provider]) {
          a.refresh_tokens(session.oauth[provider], session, opts != null ? opts.force_refresh : void 0)
          .then(function(credentials) {
          	credentials.public_key = session.public_key;
          	credentials.secret_key = session.secret_key;
            return defer.resolve(a.construct_request_object(credentials));
          })
          .fail(defer.reject);
        } else {
          defer.reject(('Cannot authenticate from session for provider \'' + provider + '\''));
        }
        return defer.promise;
      }
      defer.reject(('Could not authenticate, parameters are missing or wrong'));
      return defer.promise;
    },
    construct_request_object: function(credentials) {
      var k, request_object;
      request_object = {};
      for (k in credentials) {
        request_object[k] = credentials[k];
      }
      request_object.get = function(url, options) {
        return requestio.make_request(request_object, 'GET', url, options);
      };
      request_object.post = function(url, options) {
        return requestio.make_request(request_object, 'POST', url, options);
      };
      request_object.patch = function(url, options) {
        return requestio.make_request(request_object, 'PATCH', url, options);
      };
      request_object.put = function(url, options) {
        return requestio.make_request(request_object, 'PUT', url, options);
      };
      request_object.del = function(url, options) {
        return requestio.make_request(request_object, 'DELETE', url, options);
      };
      request_object.me = function(options) {
        return requestio.make_me_request(request_object, options);
      };
      request_object.getCredentials = function() {
        return credentials;
      };
      request_object.wasRefreshed = function() {
        return credentials.refreshed;
      };
      return request_object;
    },
    authenticate: function(code, session, public_key, secret_key) {
      var defer;
      defer = Q.defer();
      session.public_key = public_key;
      session.secret_key = secret_key;
      request.post({
        url: cache.oauthd_url + cache.oauthd_base + '/access_token',
        form: {
          code: code,
          key: session.public_key,
          secret: session.secret_key
        }
      }, function(e, r, body) {
        var response, _ref;
        if (e) {
          defer.reject(e);
          return;
        }
        
        if(r.statusCode !== 200) {
        	return defer.reject('OAuth.io / oauthd responded with : ' + body);
        }

        try {
          response = JSON.parse(body);
        } catch (_error) {
          e = _error;
          defer.reject('OAuth.io response could not be parsed');
          return;
        }
        
        if (response.expires_in) {
          response.expires = new Date().getTime() + response.expires_in * 1000;
        }
        response.public_key = session.public_key;
        response.secret_key = session.secret_key;
        response = a.construct_request_object(response);
        if ((session != null)) {
          session.oauth = session.oauth || {};
          session.oauth[response.provider] = response;
        }
        return defer.resolve(response);
      });
      return defer.promise;
    }
  };
  return a;
};
