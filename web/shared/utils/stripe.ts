// One definition of the chat price and pitch copy: the root shared/ module. A second
// copy here let the unlock button and the create-intent route (which reads the root
// copy) disagree about the price after a one-sided change.
export * from '../../../shared/utils/stripe';
