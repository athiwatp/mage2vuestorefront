'use strict';

const MongoClient = require('mongodb').MongoClient;
const AdapterFactory = require('./factory');


class AbstractAdapter{

  validateConfig(config){

    if(!config['db']['url'])
      throw Error('db.url must be set up in config');

  }

  constructor(app_config){
    this.config = app_config;

    let factory = new AdapterFactory(app_config);
    this.db = factory.getAdapter('nosql', app_config.db.driver);
    
    this.db = null;
    this.total_count = 0;
    this.page_count = 0;
    this.page_size = 50;
    this.page = 0;
    this.current_context = {};

    this.use_paging = false;
    this.is_federated = false;

    this.validateConfig(this.config);
    this.processItems = this.processItems.bind(this);
  }

  isValidFor (entity_type){
    throw Error('isValidFor must be implemented in specific class');
  }

  getCurrentContext(){
    return this.current_context;
  }

  
/**
 * Run products/categories/ ... import 
 * @param {Object} context import context with parameter such "page", "size" and other search parameters
 */
  run (context){

    this.current_context = context;
    this.db.connect(function () {
      logger.info("Connected correctly to server");

      this.onDone = this.current_context.done_callback ? this.current_context.done_callback : () => {};
      this.getSourceData(this.current_context).then(this.processItems);
      
    });

  }

  prepareItems(items){
    if(items.totalCount)
      this.total_count = items.totalCount;

    if(!Array.isArray(items))
      items = new Array(items);

    return items;
  }

  isFederated(){
    return this.is_federated;
  }

  processItems(items, level){

    if(isNaN(level))
      level = 0;

    items = this.prepareItems(items);

    let count =  items.length;
    let index = 0;

    if(count == 0){
      logger.warn('No records to process!');
      return this.onDone(this);
    }

    let db = this.db;
    if(!db)
      throw new Error('No MongoDb connection established!');

    items.map( (item) => {

      logger.info('Total count is: ' + this.total_count)
      logger.info('Importing ' + index + ' of ' + count + ' - ' + this.getLabel(item));

        this.db.updateDocument(this.getCollectionName(), item);

          if(item.childrenData && item.childrenData.length > 0){
            logger.log('--L:' + level + ' Processing child items ...');
            this.processItems(item.childrenData, level + 1);
          }

          if(index == (count-1)) // page done!
          {
            logger.debug('--L:' + level +  ' Level done!');

            if(level == 0){

              if(this.use_paging  && !this.isFederated()){ //TODO: paging should be refactored using queueing

                  if(this.page >= (this.page_count-1)){
                    logger.info('All pages processed!');
                    this.db.close();

                    this.onDone(this);
                  } else  {

                    this.page ++;
                    logger.debug('Switching page to ' + this.page);

                    this.getSourceData(this.getCurrentContext()).then(this.processItems);
                }

              } else {
                logger.info('All records processed!');
                this.db.close();

                return this.onDone(this);

              }

            }
          }

          index ++;
      })

  }

}

module.exports = AbstractAdapter;