const mysql = require('mysql');
const config = require('./config.json')
const crypto = require('crypto');

const pool = mysql.createPool({
    host: config.mysql_host,
    user: config.mysql_user,
    password: config.mysql_pass,
    database: config.mysql_db,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

function validateEmail(email) {
    const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

exports.quickFunctions = {
    validate: {
        email: function (e) {validateEmail(e)}
    }
}


exports.session = {
    check: (sid, cb) => {
        sid = String(sid);
        if (!sid) { cb(false); console.log('No Session'); return };
        pool.query("SELECT `accept`, `exp-date`, `uid`  FROM `video`.`session` WHERE `id`= ?", sid, (err, res) => {
            if (err) { cb(false); console.error(err); return };
            if (res.length == 0) { cb(false); console.log('No Session'); return };
            if (res[0].exp_date < Date.now()) { cb(false); console.log('Session Expired'); return };
            cb(res[0].accept);
        });

    },
    create: (uid, req, cb) => {
        if (req.headers['x-forwarded-for'] && req.headers['user-agent'] && req.headers['cf-ipcountry']) {
            const sid = crypto.randomBytes(128).toString('hex');
            const values = [sid, uid, req.headers['x-forwarded-for'], req.headers['user-agent']]
            //const values = [sid, uid, '000.000.000.000', req.headers['User-Agent'], 'TEST'] // ONLY FOR TESTING
            console.log("SID Created", sid)
            pool.query('INSERT INTO `video`.`session` (`id`, `uid`, `address`, `User-Agent`) VALUES (?, ?, ?, ?, ?)', values, (err, res) => {
                if (err) { cb(false); console.error(err); return };
                cb(sid);
            });
        } else { 
            cb(false) 
        }
    },    
    delete: (sid, cb) => {
        pool.query('DELETE FROM `video`.`session` WHERE `id`= ?', sid, (err, res) => {
            if (err) { cb(false); console.error(err); return };
            cb(true);
        });
    },
    login: (email, username, password, cb) => {
        if (validateEmail(email)) {
            password = crypto.createHash('sha256').update(password+config.fluff).digest('hex')
            pool.query('SELECT * FROM `video`.`account` WHERE `email` = ? AND password = ?', [email, password], (err, res) => {
                if (err) { cb(false); console.error(err); return };
                if (res.length == 0) { cb(false); console.log('No User'); return };
                cb(res[0]);
            });
        } else {
            cb(false)
        }
    }
}

exports.shows = {
    all: () => {
        return new Promise((resolve) => {
            pool.query('SELECT `id`, `name`, `poster`, `rating`, `type`, `categories` FROM `video`.`shows` ORDER BY `name` ASC LIMIT 1000;', (err, res) => {
                if (err) { console.error(err); resolve(false); return };
                resolve(res);
            })
        })
    },
    get: (id) => {
        return new Promise((resolve) => {
            pool.query('SELECT * FROM `video`.`shows` WHERE `id` = ? LIMIT 1', [id], (err, res) => {
                if (err) { console.error(err); resolve(false); return };
                resolve(res[0]);
            })
        }) 
    },
    seasons: (id, seasons, cb) => {
        var all = [];
        seasons.forEach(s => {
            all.push(new Promise((resolve, reject)=> {
                pool.query('SELECT `id`, `show_id`, `name`, `season`, `ep` FROM `video`.`episodes` WHERE `show_id` = ? AND `season`= ? AND `status`= "visible" ORDER BY `order`', [id, s.season], (err, res) => {
                    if (err) { resolve(false); console.error(err) } else if (res[0]) { resolve(res[0]) } else { resolve(null) }
                })
            }))
        })
        Promise.all(all).then((s) => {
            cb(s);
        }).catch((err) => {
            cb(false);
        })
    },
    related: (related) => {
        return new Promise((resolve) => {
            if (related) {
                pool.query("SELECT `id`, `name`, `poster` FROM `video`.`shows` WHERE `id` in (" + pool.escape(related) + ")", (err, res) => {
                    if (err) { console.error(err); resolve(false); return };
                    resolve(res);
                })
            } else {
                resolve(null)
            }
        })
    },
    history: (id) => {
        return new Promise ((resolve) => {
            pool.query('SELECT `show_id` FROM `video`.`userhistory` WHERE `user_id` = ? ORDER BY `updateTimestamp` DESC LIMIT 1;', [id], (err, res) => {
                if (err) { resolve(false); console.error(err) } else if (res) { resolve(res) } else { resolve(null) }
            })
        })
    } 
}

exports.episode = {
    all: (show_id, status) => {
        return new Promise((resolve) => {
            pool.query('SELECT `id`, `show_id`, `name`, `season`, `ep` FROM `video`.`episodes` WHERE `show_id` = ? AND `status`= ? ORDER BY `order`', [show_id, status], (err, res) => {
                if (err) { resolve(false); console.error(err) } else if (res) { resolve(res) } else { resolve(null) }
            })
        })
    },
    get: (show_id, episode_id) => {
        return new Promise((resolve) => {
            pool.query('SELECT * FROM `video`.`episodes` WHERE `show_id` = ? AND `id`= ? LIMIT 1', [show_id, episode_id], (err, res) => {
                if (err) { resolve(false); console.error(err) } else if (res[0]) { resolve(res[0]) } else { resolve(null) }
            })    
        })
    }
}

exports.history = {
    get: (user_id, show_id) => {
        return new Promise((resolve) => {
            pool.query('SELECT * FROM `video`.`userhistory` WHERE `user_id` = ? AND `show_id`= ? LIMIT 500;', [user_id, show_id], (err, res) => {
                if (err) { resolve(false); console.error(err) } else if (res) { resolve(res) } else { resolve(null) }
            })
        })
    },
    find: (user_id, show_id, episode_id, cb) => {
        pool.query('SELECT * FROM `video`.`userhistory` WHERE `user_id` = ? AND `show_id`= ? LIMIT 500;', [user_id, show_id], (err, res) => {
            if (err) { cb(false); console.error(err) } else if (res) { cb(res) } else { cb(null) }
        })
    }
}

exports.user = {
    get: (id) => {
        return new Promise((resolve) => {
            pool.query('SELECT email,username,verified,admin,pfp,settings,watchLater FROM `video`.`account` WHERE `id` = ? LIMIT 1;', [id], (err, res) => {
                if (err) { resolve(false); console.error(err) } else if (res[0]) { res[0].settings = JSON.parse(res[0].settings); resolve(res[0]) } else { resolve(null) }
            })
        })
    },
    pfp: (id, pfp) => {
        return new Promise((resolve) => {
            pool.query('UPDATE `video`.`account` SET `pfp`= ? WHERE  `id`= ?;', [pfp, id], (err, res) => {
                if (err) { resolve(false); console.error(err) } else if (res) { resolve(true) } else { resolve(null) }
            })
        })
    },
    watchLater: {
        get: (id) => {
            return new Promise((resolve) => {
                pool.query('SELECT watchLater FROM `video`.`account` WHERE `id` = ? LIMIT 1;', [id], (err, res) => {
                    if (err) { resolve(false); console.error(err) } else if (res[0]) { resolve(res[0].watchLater.split(",")) } else { cb(null) }
                })
            })
        },
        update: (id, wl) => {
            return new Promise((resolve) => {
                wl = wl.join(",")
                pool.query('UPDATE `video`.`account` SET `watchLater`= ? WHERE `id`= ?', [wl, id], (err, res) => {
                    if (err) { resolve(false); console.error(err) } else if (res) { resolve(true) } else { cb(null) }
                })
            })
        }
    },
    history: {
        get: (uniqueId) => {
            return new Promise((resolve) => {
                pool.query('SELECT show_id,videoTime,videoLength FROM `video`.`userhistory` WHERE uniqueId = ? LIMIT 1;', [uniqueId], (err, res) => {
                    if (err) { resolve(false); console.error(err) } else if (res[0]) { resolve(res[0]) } else { resolve(null) }
                })
            })
        },
        update: (user_id, show_id, video_id, videoTime, videoLength, uid) => {
            return new Promise((resolve) => {
                let val = [show_id, video_id, videoTime, videoLength, new Date, user_id, uid]
                pool.query('UPDATE `video`.`userhistory` SET show_id=?, video_id=?, videoTime=?,videoLength=?, updateTimestamp=? WHERE user_id=? AND uniqueId=?;', val, (err, res) => {
                    if (err) { resolve(false); console.error(err) } else if (res) { resolve(true) } else { resolve(null) }
                })
            })
        },
        new: (user_id, show_id, video_id, videoTime, videoLength, uid) => {
            return new Promise((resolve) => {
                let val = [user_id, show_id, video_id, videoTime, videoLength, uid];
                pool.query('INSERT INTO `video`.`userhistory` (`user_id`, `show_id`, `video_id`, `videoTime`, `videoLength`, `uniqueId`) VALUES (?, ?, ?, ?, ?, ?);', val, (err, res) => {
                    if (err) { resolve(false); console.error(err) } else if (res) { resolve(true) } else { resolve(null) }
                })
            })
        }
    }
}