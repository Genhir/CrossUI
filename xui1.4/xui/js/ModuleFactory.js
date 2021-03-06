Class('xui.ModuleFactory',null,{
    Initialize:function(){
        var ns=this;
        xui.getModule=function(cls, onEnd, threadid, cached, properties, events){
            return ns.getModule.apply(ns,arguments)
        };
        xui.newModule=function(cls, onEnd, threadid, properties, events){
            return ns.newModule.apply(ns,arguments)
        };
        xui.showModule=function(cls, beforeShow, onEnd, threadid, cached, properties, events, parent, subId, left, top){
            return ns.getModule(cls, function(err, module, threadid){
                if(!err && false!==_.tryF(beforeShow, [module, threadid], module)){
                    this.show.apply(module, [onEnd,parent,subId,threadid,left,top]);
                }else{
                    _.tryF(onEnd, [err, module, threadid], module);
                }
            }, threadid, cached, properties, events);
        };

        //compitable
        xui.getCom=xui.getModule;
        xui.newCom=xui.newModule;
        xui.showCom=xui.showModule;

        ns.setCom=ns.setModule;
        ns.getComFromCache=ns.getModuleFromCache;
        ns.getCom=ns.getModule;
        ns.newCom=ns.newModule;
        ns.storeCom=ns.storeModule;
        ns.prepareComs=ns.prepareModules;

        xui.ComFactory=ns;
    },
    Static:{
        _pro:{},
        _cache:{},
        _domId:'xui:ModuleFactory:',
        getProfile:function(key){
            return key?this._pro[key]:this._pro;
        },
        setProfile:function(key, value){
            if(typeof key=='string')
                this._pro[key]=value;
            else if(_.isHash(key))
                this._pro=key;
            return this;
        },
        destroyAll:function(){
            _.each(this._cache,function(o){
                _.tryF(o.destroy,[],o);
            });
            this._cache={};
        },
        broadcast:function(fun){
            if(typeof fun=='function'){
                var i,c=this._cache;
                for(i in c)
                    fun.call(c[i],i);
            }
        },

        setModule:function(id, obj){
            this._cache[id]=obj;
            if(obj)obj.moduleRefId=id;
            return this;
        },
        getModuleFromCache:function(id){
            return this._cache[id]||null;
        },
        //cached:false->don't get it from cache, and don't cache the result.
        getModule:function(id, onEnd, threadid, cached, properties, events){
            if(!id){
                var e=new Error("No id");
                _.tryF(onEnd,[e,null,threadid]);
                if(threadid&&xui.Thread.isAlive(threadid))xui.Thread(threadid).abort();
                throw e;
                return;
            }
            cached=cached!==false;
            var c=this._cache,
                p=this._pro,
                config,
                clsPath;

            if(cached && c[id] && !c[id].destroyed){
                _.tryF(onEnd, [null,c[id],threadid], c[id]);
                return c[id];
            }else{
                // if no configure
                if(!(config=p[id])){
                    config={
                        cls:id,
                        cached:cached,
                        properties:properties,
                        events:events
                    };
                    clsPath=id;
                }else
                    clsPath=config.cls || config;

                var self=arguments.callee, 
                    me=this,
                    task=function(cls,config,threadid){
                        if(!_.isFun(cls))
                            throw "'"+clsPath+"' is not a constructor";
                        var o = new cls();

                        if(config.properties)
                            _.merge(o.properties,config.properties,'all');
                        if(config.events)
                            _.merge(o.events,config.events,'all');
                        if(config.cached!==false)
                            xui.ModuleFactory.setModule(id, o);

                        var args = [function(err,module,threadid){
                            var arr = module.getUIComponents().get(),
                                fun=function(arr,subcfg,firstlayer){
                                    var self1 = arguments.callee;
                                    _.arr.each(arr,function(v,i){
                                        if(v.children){
                                            var a=[];
                                            _.arr.each(v.children,function(o){
                                                a[a.length]=o[0];
                                            });
                                            self1(a, subcfg);
                                        }
                                    });
                                };
                            //handle tag sub from module
                            fun(arr,config.children,1);
                        }];
                        args.push(threadid||null);

                        //insert first
                        if(onEnd)
                            xui.Thread(threadid).insert({
                                task:onEnd,
                                args:[null,o,threadid],
                                scope:o
                            });
                        //latter
                        _.tryF(o[config.iniMethod ||'create'], args, o);
                    };
                xui.Thread.observableRun(function(threadid){
                    var f=function(threadid){
                        // this for js path doesn't match Class name space
                        var cls=this||xui.SC.get(clsPath);
                        // it must be a xui Class
                        if(cls&&cls.$xui$){
                            xui.Thread(threadid).insert({
                                task:task,
                                args:[cls, config,threadid]
                            });
                        }else{
                            var e=new Error("Cant find Class '"+clsPath+"' in the corresponding file (maybe SyntaxError)");
                            _.tryF(onEnd,[e,null,threadid]);
                            if(threadid&&xui.Thread.isAlive(threadid))xui.Thread(threadid).abort();
                            throw e;
                        }
                    };
                    xui.SC(clsPath, function(path){
                        if(path)
                            f.call(this, threadid);
                        else{
                            var e=new Error("No class name");
                            _.tryF(onEnd,[e,null, threadid]);
                            if(threadid&&xui.Thread.isAlive(threadid))xui.Thread(threadid).abort();
                            throw e;
                        }
                    }, true,threadid,{
                        retry:0,
                        onFail:function(e){
                            _.tryF(onEnd,[e,null,threadid]);
                        }
                    });
                },null,threadid);
            }
        },
        newModule:function(cls, onEnd, threadid, properties, events){
            return this.getModule(cls, onEnd, threadid, false, properties, events);
        },
        storeModule:function(id){
            var m,t,c=this._cache,domId=this._domId;
            if(t=c[id]){
                if(!(m=xui.Dom.byId(domId)))
                    //using display:none here for performance, when appendchild, it'll not trigger layout etc.
                    xui('body').prepend(xui.create('<div id="'+domId+'" style="display:none;"></div>'));
                m=xui(domId);
                t=t.getUIComponents();
                if(!t.isEmpty()){
                    //detach
                    t.get(0).unlinkParent();
                    //move to hide
                    m.append(t);
                }
            }
        },
        prepareModules:function(arr){
            var self=this,funs=[];
            _.arr.each(arr, function(i){
                funs.push(function(){
                    self.getModule(i);
                });
            });
            xui.Thread(null, funs, 500).start();
            return this;
        }
    }
});