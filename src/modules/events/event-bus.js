const EventEmitter = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20);
  }

  static Events = {
    PAYMENT_RECEIVED: 'payment:received',
    EXAM_PUBLISHED: 'exam:published',
    FEE_REMINDER: 'fee:reminder',
    STUDENT_REGISTERED: 'student:registered',
    RESULT_PUBLISHED: 'result:published'
  };

  emitSafe(event, data) {
    try {
      this.emit(event, data);
    } catch (error) {
      console.error(`Error emitting event ${event}:`, error);
    }
  }
}

const eventBus = new EventBus();
module.exports = eventBus;