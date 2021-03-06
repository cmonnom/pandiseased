/**
 * Display the Cart Manager page that lets users rename and delete any of the carts they own, and
 * to create new carts.
 */
import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../../libs/bootstrap/modal';
import { SortTablePanel, SortTable } from '../sorttable';
import Status from '../status';
import { setCartNameIdentifierAndSave, cartOperationInProgress } from './actions';
import { cartCreate, cartUpdate, cartRetrieve } from './database';
import { cartSetSettingsCurrent } from './settings';
import CartShare from './share';
import switchCart from './switch';


/**
 * Renders and handles events in the radio button for each row of the cart manager that displays
 * the status of and sets the current cart.
 */
class CurrentCartButtonComponent extends React.Component {
    constructor() {
        super();
        this.handleRadioButtonChange = this.handleRadioButtonChange.bind(this);
    }

    /**
     * Called when the user clicks a radio button to set the current cart. Does nothing if the
     * current user in session_properties hasn't yet been set.
     */
    handleRadioButtonChange() {
        const { cart, user, onCurrentCartClick } = this.props;
        if (user) {
            // Set the browser's localstorage cart settings to remember this button's cart as the
            // current cart, and update the cart store for the current cart.
            cartSetSettingsCurrent(user, cart['@id']);
            onCurrentCartClick();
        }
    }

    render() {
        const { cart, current, inProgress } = this.props;
        const selected = cart['@id'] === current;
        return (
            <input
                type="radio"
                value={cart['@id']}
                onChange={this.handleRadioButtonChange}
                checked={selected}
                className="cart-manager-table__current-button"
                disabled={cart.status === 'deleted' || cart.status === 'disabled' || inProgress}
            />
        );
    }
}

CurrentCartButtonComponent.propTypes = {
    /** The radio button represents this cart */
    cart: PropTypes.object.isRequired,
    /** @id of the current cart */
    current: PropTypes.string.isRequired,
    /** True if cart operation in progress */
    inProgress: PropTypes.bool.isRequired,
    /** Current user object from session_properties */
    user: PropTypes.object,
    /** Dispatch function for setting the current cart in the cart Redux store */
    onCurrentCartClick: PropTypes.func.isRequired,
};

CurrentCartButtonComponent.defaultProps = {
    user: null,
};

CurrentCartButtonComponent.mapStateToProps = (state, ownProps) => ({
    inProgress: state.inProgress,
    ...ownProps,
});

CurrentCartButtonComponent.mapDispatchToProps = (dispatch, ownProps) => ({
    onCurrentCartClick: () => dispatch(switchCart(ownProps.cart['@id'], ownProps.fetch)),
});

const CurrentCartButton = connect(CurrentCartButtonComponent.mapStateToProps, CurrentCartButtonComponent.mapDispatchToProps)(CurrentCartButtonComponent);


/**
 * Renders the cart-rename modal name input field, broken out as a separate component so that it
 * gets its own mount event that lets us select the <input> contents when the modal appears. Uses a
 * controlled <input>, but the parent component tracks its contents.
 */
class NameInput extends React.Component {
    constructor() {
        super();
        this.inputField = null;
    }

    componentDidMount() {
        // Make sure the user can type into this field as soon as the modal appears without having
        // to click in the field.
        this.inputField.focus();
        this.inputField.select();
    }

    render() {
        const { name, label, inputChangeHandler, nonValidMessage, inline } = this.props;
        return (
            <div className={inline ? 'form-inline' : null}>
                <div className="form-group">
                    <label htmlFor="new-cart-name">{label}:&nbsp;</label>
                    <div className="form-element-with-valid-message">
                        <input
                            type="text"
                            id="new-cart-name"
                            className="form-control cart-rename__input"
                            ref={(input) => { this.inputField = input; }}
                            value={name}
                            onChange={inputChangeHandler}
                        />
                        <label htmlFor="new-cart-name" className="non-valid-label">{nonValidMessage}</label>
                    </div>
                </div>
            </div>
        );
    }
}

NameInput.propTypes = {
    /** Contents of the name <input>; changes as the user types */
    name: PropTypes.string,
    /** Label for the input field */
    label: PropTypes.string.isRequired,
    /** Called when the user changes the contents of the <input> */
    inputChangeHandler: PropTypes.func.isRequired,
    /** Validation error message */
    nonValidMessage: PropTypes.string,
    /** True if label and input on the same line */
    inline: PropTypes.bool,
};

NameInput.defaultProps = {
    name: '',
    nonValidMessage: '',
    inline: false,
};


/**
 * Renders the cart-rename modal identifier input field.
 */
const IdentifierInput = ({ identifier, inputChangeHandler, nonValidMessage }) => (
    <div>
        <div className="form-group">
            <label htmlFor="new-cart-identifier">New identifier for cart:&nbsp;</label>
            <div className="form-element-with-valid-message">
                <input
                    id="new-cart-identifier"
                    className="form-control cart-rename__input"
                    type="text"
                    value={identifier}
                    onChange={inputChangeHandler}
                />
                <label htmlFor="new-cart-name" className="non-valid-label">{nonValidMessage}</label>
            </div>
        </div>
    </div>
);

IdentifierInput.propTypes = {
    /** Contents of the identifier <input>; changes as the user types */
    identifier: PropTypes.string,
    /** Called when the user changes the contents of the <input> */
    inputChangeHandler: PropTypes.func.isRequired,
    /** Validation error message */
    nonValidMessage: PropTypes.string,
};

IdentifierInput.defaultProps = {
    identifier: '',
    nonValidMessage: '',
};


/**
 * Convert a cart name to the closest legal cart identifier.
 * @param {string} name Human-readable name to convert
 * @return {string} `name` converted to one legal for URIs
 */
const convertNameToIdentifier = name => name.toLowerCase().replace(/\W+/g, '-');


/**
 * Renders and handles events for the New Cart and Rename buttons, including the modal that appears
 * when you click them.
 */
class NameCartButtonComponent extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            /** Current value of new name in its <input> text field */
            newName: props.cart ? props.cart.name : '',
            /** Current value of identifier in its <input> text field */
            newIdentifier: props.cart ? props.cart.identifier : '',
            /** True if name conflicts with existing */
            nameConflict: false,
            /** True if the identifier conflicts with existing */
            identifierConflict: false,
            /** True if rename modal is visible */
            modalOpen: false,
            /** True if automatically transferring name to identifier */
            transferEnabled: false,
        };
        this.handleActuator = this.handleActuator.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleNameInputChange = this.handleNameInputChange.bind(this);
        this.handleIdentifierInputChange = this.handleIdentifierInputChange.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleControlClick = this.handleControlClick.bind(this);
    }

    componentDidUpdate() {
        const { create, cart } = this.props;
        if (!create && !this.state.modalOpen && (cart.name !== this.state.newName || cart.identifier !== this.state.newIdentifier)) {
            // If we got an update but the modal isn't open, then we're updating for sorting the
            // table of carts, so we have to re-copy the props cart name to the state cart name,
            // because sorting the table doesn't sort the states of the React components within it.
            this.setState({
                newName: cart ? cart.name : '',
                newIdentifier: cart ? cart.identifier : '',
            });
        }
    }

    /**
     * Called when the button to actuate the modal is clicked.
     */
    handleActuator() {
        this.setState({ modalOpen: true });
    }

    /**
     * Called when the user closes the modal, cancelling any changes to the name and identifier.
     */
    handleClose() {
        this.setState({
            modalOpen: false,
            newName: '',
            newIdentifier: '',
            nameConflict: false,
            identifierConflict: false,
        });
    }

    /**
     * Called when the user changes the name input field text.
     * @param {object} e React synthetic browser event
     */
    handleNameInputChange(e) {
        const { cartManager, cart, create } = this.props;
        const name = e.target.value;

        // Display a warning message if the name in the input field matches another cart's name
        // belonging to the current user. Don't give the warning if the cart with a conflicting
        // name is the cart being renamed.
        const upperCaseName = name.trim().toUpperCase();
        const conflictingCart = cartManager['@graph'].find(cartItem => cartItem.status !== 'disabled' && cartItem.status !== 'deleted' && cartItem.name.trim().toUpperCase() === upperCaseName);
        const nameConflict = conflictingCart && (create || conflictingCart['@id'] !== cart['@id']);
        this.setState({ newName: name, nameConflict });

        // If the user has requested transferring the name to the identifier, convert the name to
        // the identifier text field.
        if (this.state.transferEnabled) {
            this.setState({ newIdentifier: convertNameToIdentifier(name) });
        }
    }

    /**
     * Called when the user changes the identifier input field text.
     * @param {e} e React synthetic browser event
     */
    handleIdentifierInputChange(e) {
        const identifier = convertNameToIdentifier(e.target.value);
        this.setState({ newIdentifier: identifier, identifierConflict: false });
    }

    /**
     * Called when the user clicks the submit button to set the new name and identifier. The
     * function to execute the operation depends on whether we're creating or renaming a cart.
     */
    handleSubmit() {
        const { create, onCreate, onRename, updateCartManager } = this.props;
        const { newName, newIdentifier } = this.state;
        const submitFunc = create ? onCreate : onRename;
        submitFunc(newName.trim(), newIdentifier).then(() => {
            // Successfully changed the cart name/identifier. Indicate the cart manager needs
            // reloading so it displays the new cart information.
            this.handleClose();
            updateCartManager();
        }, (err) => {
            if (err === 409) {
                // The back end detected the identifer already exists in the database. Display the
                // error and let the user continue in the modal.
                this.setState({ identifierConflict: true });
            }
        });
    }

    /**
     * Handle click in transfer button by toggling transferEnabled state property, and converting
     * the name to the identifier if the transfer button is being enabled.
     */
    handleControlClick() {
        this.setState((prevState) => {
            const newState = { transferEnabled: !prevState.transferEnabled };
            if (!prevState.transferEnabled) {
                newState.newIdentifier = convertNameToIdentifier(prevState.newName);
                newState.identifierConflict = false;
            }
            return newState;
        });
    }

    render() {
        const { create, cart, inProgress, actuatorCss, disabled, disabledTooltip } = this.props;
        const modalTitle = create ? 'New cohort' : <span>Rename cohort: {cart.name}</span>;
        const actuatorTitle = create ? 'New cohort' : 'Rename';
        return (
            <div className="cart-manager-table__action-button">
                {disabled ?
                    <div
                        className="cart-manager-table__button-overlay"
                        title={disabledTooltip}
                    />
                : null}
                <button className={`btn btn-info btn-sm${actuatorCss ? ` ${actuatorCss}` : ''}`} onClick={this.handleActuator} disabled={disabled}>{actuatorTitle}</button>
                {this.state.modalOpen ?
                    <Modal closeModal={this.handleClose} labelId="name-cart-label" descriptionId="name-cart-description">
                        <ModalHeader title={<h4>{modalTitle}</h4>} labelId="name-cart-label" closeModal={this.handleClose} />
                        <ModalBody addCss="cart-rename">
                            <div className="cart-rename__name-area">
                                <NameInput
                                    inputChangeHandler={this.handleNameInputChange}
                                    name={this.state.newName}
                                    label="New name for cohort"
                                    nonValidMessage={this.state.nameConflict ? 'Same name as another of your carts' : ''}
                                />
                                <p className="cart-rename__explanation" id="name-cart-description" role="document">
                                    The cohort name can comprise any characters you need to identify
                                    your cohorts to yourself. Every cohort belonging to you must have a
                                    unique name.
                                </p>
                            </div>
                            <div className={`cart-rename__control-area${this.state.transferEnabled ? ' cart-rename__control-area--enabled' : ''}`}>
                                <button
                                    title="Select to automatically transfer the name to a plausibly similar identifier"
                                    onClick={this.handleControlClick}
                                />
                            </div>
                            <div className="cart-rename__identifier-area">
                                <IdentifierInput
                                    inputChangeHandler={this.handleIdentifierInputChange}
                                    identifier={this.state.newIdentifier}
                                    nonValidMessage={this.state.identifierConflict ? 'Another cart exists with that identifier' : ''}
                                />
                                <p className="cart-rename__explanation">
                                    The cohort identifier appears in the URL for your cohort and can
                                    only comprise lowercase letters, numbers, underscores, and
                                    hyphens. It must be unique among all cohort belonging to all
                                    KCE portal users. Cohorts without an identifier can be viewed
                                    with an automatically assigned identifier.
                                </p>
                            </div>
                        </ModalBody>
                        <ModalFooter
                            submitBtn={
                                <button
                                    className="btn btn-info"
                                    disabled={this.state.nameConflict || this.state.newName.length === 0 || inProgress}
                                    onClick={this.handleSubmit}
                                >
                                    {actuatorTitle}
                                </button>}
                            closeModal={<button className="btn btn-info" onClick={this.handleClose}>{inProgress ? <span>Close</span> : <span>Cancel</span>}</button>}
                            addCss="cart-rename__footer-controls"
                        />
                    </Modal>
                : null}
            </div>
        );
    }
}

NameCartButtonComponent.propTypes = {
    /** cart-manager object, normally from encoded context */
    cartManager: PropTypes.object.isRequired,
    /** Cart object being renamed, unless making new cart */
    cart: PropTypes.object,
    /** True if cart operation is in progress */
    inProgress: PropTypes.bool.isRequired,
    /** True to create a new cart; false to rename an existing cart */
    create: PropTypes.bool,
    /** CSS to add to actuator button */
    actuatorCss: PropTypes.string,
    /** True if actuating button should be disabled */
    disabled: PropTypes.bool,
    /** Tooltip to display if button is disabled */
    disabledTooltip: PropTypes.string,
    /** Redux action to rename a cart */
    onRename: PropTypes.func.isRequired,
    /** Function to create a new cart; used if `create` is true */
    onCreate: PropTypes.func.isRequired,
    /** Function to update the cart manager */
    updateCartManager: PropTypes.func.isRequired,
};

NameCartButtonComponent.defaultProps = {
    cart: null,
    create: false,
    actuatorCss: '',
    disabled: false,
    disabledTooltip: '',
};

NameCartButtonComponent.mapStateToProps = (state, ownProps) => ({
    inProgress: state.inProgress,
    ...ownProps,
});

NameCartButtonComponent.mapDispatchToProps = (dispatch, ownProps) => ({
    onRename: (name, identifier) => dispatch(setCartNameIdentifierAndSave({ name, identifier }, ownProps.cart, ownProps.user, ownProps.fetch)),
    onCreate: (name, identifier) => cartCreate({ name, identifier }, ownProps.fetch),
});

const NameCartButton = connect(NameCartButtonComponent.mapStateToProps, NameCartButtonComponent.mapDispatchToProps)(NameCartButtonComponent);


/**
 * Component to display a button to delete a cart, with a warning that lets them back out.
 */
class DeleteCartButtonComponent extends React.Component {
    constructor() {
        super();
        this.state = {
            /** True if delete warning modal is open */
            modalOpen: false,
        };
        this.handleSubmitClick = this.handleSubmitClick.bind(this);
        this.handleDeleteClick = this.handleDeleteClick.bind(this);
        this.handleCloseClick = this.handleCloseClick.bind(this);
    }

    /**
     * Called when the user clicks the Delete button in the warning modal to confirm they want to
     * delete the cart.
     */
    handleSubmitClick() {
        const { setInProgress, fetch, updateCartManager } = this.props;
        setInProgress(true);
        cartUpdate(this.props.cart['@id'], { status: 'deleted' }, ['identifier'], fetch, false).then(() => {
            setInProgress(false);
            updateCartManager();
        });
    }

    /**
     * Called when the user clicks the Delete button to bring up the warning modal.
     */
    handleDeleteClick() {
        this.setState({ modalOpen: true });
    }

    /**
     * Called when the user clicks either of the close buttons for the warning modal.
     */
    handleCloseClick() {
        this.setState({ modalOpen: false });
    }

    render() {
        const { cart, current, inProgress } = this.props;
        let disabledTooltip = '';
        if (cart['@id'] === current) {
            disabledTooltip = 'Cannot delete the current cohort';
        } else if (cart.status === 'deleted') {
            disabledTooltip = 'Cohort has already been deleted';
        } else if (inProgress) {
            disabledTooltip = 'Cohort operation in progress';
        }
        return (
            <div className="cart-manager-table__action-button">
                <div className="cart-manager-table__delete-group">
                    {disabledTooltip ?
                        <div
                            className="cart-manager-table__button-overlay"
                            title={disabledTooltip}
                        />
                    : null}
                    <button className="btn btn-danger btn-sm" onClick={this.handleDeleteClick} disabled={!!disabledTooltip}><i className="icon icon-trash-o" />&nbsp;Delete</button>
                </div>
                {this.state.modalOpen ?
                    <Modal closeModal={this.handleCloseClick}>
                        <ModalHeader title={<h4>Delete cart: {cart.name}</h4>} closeModal={this.handleCloseClick} />
                        <ModalBody>
                            This cohort contains {cart.element_count} item{cart.element_count !== 1 ? 's' : ''}. Deleting cohorts is not reversible.
                        </ModalBody>
                        <ModalFooter
                            submitBtn={this.handleSubmitClick}
                            submitTitle="Delete"
                            closeModal={this.handleCloseClick}
                        />
                    </Modal>
                : null}
            </div>
        );
    }
}

DeleteCartButtonComponent.propTypes = {
    /** Cart this delete button is for */
    cart: PropTypes.object.isRequired,
    /** Current cart @id */
    current: PropTypes.string.isRequired,
    /** True if cart operation in progress */
    inProgress: PropTypes.bool.isRequired,
    /** Function to call to set the in-progress state of the cart */
    setInProgress: PropTypes.func.isRequired,
    /** Function to call to update the cart manager page */
    updateCartManager: PropTypes.func.isRequired,
    /** System function for xhr requests */
    fetch: PropTypes.func.isRequired,
};

DeleteCartButtonComponent.mapStateToProps = (state, ownProps) => ({
    inProgress: state.inProgress,
    ...ownProps,
});
DeleteCartButtonComponent.mapDispatchToProps = dispatch => ({
    setInProgress: enable => dispatch(cartOperationInProgress(enable)),
});

const DeleteCartButtonInternal = connect(DeleteCartButtonComponent.mapStateToProps, DeleteCartButtonComponent.mapDispatchToProps)(DeleteCartButtonComponent);

const DeleteCartButton = (props, reactContext) => (
    <DeleteCartButtonInternal {...props} fetch={reactContext.fetch} navigate={reactContext.navigate} />
);

DeleteCartButton.contextTypes = {
    fetch: PropTypes.func,
    navigate: PropTypes.func,
};


/**
 * Displays a button to bring up the share-cart modal for the cart this button corresponds to.
 */
class ShareCartButtonComponent extends React.Component {
    constructor() {
        super();
        this.state = {
            modalOpen: false,
        };
        this.handleShareClick = this.handleShareClick.bind(this);
        this.closeShareCart = this.closeShareCart.bind(this);
    }

    /**
     * Called when the user clicks the Share button in the cart manager table.
     */
    handleShareClick() {
        this.setState({ modalOpen: true });
    }

    /**
     * Called when the user requests to close the share-cart modal.
     */
    closeShareCart() {
        this.setState({ modalOpen: false });
    }

    render() {
        const { cart } = this.props;
        let disabledTooltip;
        if (cart.status === 'deleted') {
            disabledTooltip = 'Cannot share a deleted cohort';
        } else if (cart.status === 'disabled') {
            disabledTooltip = 'Cannot share the auto-save cohort';
        }
        return (
            <div className="cart-manager-table__action-button">
                {disabledTooltip ?
                    <div
                        className="cart-manager-table__button-overlay"
                        title={disabledTooltip}
                    />
                : null}
                <button className="btn btn-info btn-sm" onClick={this.handleShareClick} disabled={!!disabledTooltip}>Share</button>
                {this.state.modalOpen ?
                    <CartShare userCart={cart} closeShareCart={this.closeShareCart} />
                : null}
            </div>
        );
    }
}

ShareCartButtonComponent.propTypes = {
    /** Cart being shared */
    cart: PropTypes.object.isRequired,
};

ShareCartButtonComponent.mapStateToProps = (state, ownProps) => ({
    cart: ownProps.cart,
});

const ShareCartButton = connect(ShareCartButtonComponent.mapStateToProps)(ShareCartButtonComponent);


/**
 * Defines the columns and contents of the cart manager table.
 */
const cartTableColumns = {
    name: {
        title: 'Name',
        headerCss: 'cart-manager-table__name-header',
        display: item => <a href={item['@id']} className="cart-manager-table__text-wrap">{item.name}</a>,
    },
    identifier: {
        title: 'Identifier',
        headerCss: 'cart-manager-table__name-header',
        display: item => <a href={item['@id']} className="cart-manager-table__text-wrap">{item.identifier}</a>,
    },
    element_count: {
        title: 'Items',
    },
    status: {
        title: 'Status',
        display: item => <Status item={item} badgeSize="small" />,
        hide: (item, columns, meta) => !meta.admin,
    },
    actions: {
        title: 'Actions',
        display: (item, meta) => {
            let disabledTooltip;
            if (item.status === 'disabled') {
                disabledTooltip = 'Cannot rename the auto-save cohort';
            } else if (meta.operationInProgress) {
                disabledTooltip = 'Cohort operation in progress';
            }
            return (
                <div className="cart-manager-table__action">
                    <NameCartButton
                        cartManager={meta.cartManager}
                        cart={item}
                        user={meta.user}
                        disabled={!!disabledTooltip}
                        disabledTooltip={disabledTooltip}
                        fetch={meta.fetch}
                        updateCartManager={meta.updateCartManager}
                    />
                    <ShareCartButton cart={item} />
                    <DeleteCartButton cartManager={meta.cartManager} cart={item} current={meta.current} updateCartManager={meta.updateCartManager} />
                </div>
            );
        },
        sorter: false,
    },
    current: {
        title: 'Current',
        display: (item, meta) => (
            <CurrentCartButton
                cart={item}
                current={meta.current}
                operationInProgress={meta.operationInProgress}
                user={meta.user}
                fetch={meta.fetch}
                onSwitchCartStart={meta.onSwitchCartStart}
                onSwitchCartComplete={meta.onSwitchCartComplete}
            />
        ),
        sorter: false,
    },
};


/**
 * Display a count of the number of non-deleted carts, and the maximum possible number of carts.
 */
const CartCounts = ({ cartManager }) => {
    const cartCount = cartManager['@graph'].reduce((sum, cart) => (cart.status !== 'deleted' ? sum + 1 : sum), 0);
    return (
        <div className="cart-counts">
            {cartCount} cohort{cartCount !== 1 ? 's' : ''} ({cartManager.cart_user_max} maximum)
        </div>
    );
};

CartCounts.propTypes = {
    /** cart-manager object from database */
    cartManager: PropTypes.object.isRequired,
};


/**
 * Display the cart manager table footer containing the legend.
 */
const CartManagerFooter = () => (
    <div className="cart-manager-table__legend">
        <div className="cart-manager-table__legend-item"><div className="cart-manager-table__chip--current" />Current</div>
        <div className="cart-manager-table__legend-item"><div className="cart-manager-table__chip--autosave" />Auto Save</div>
    </div>
);


/**
 * Main component of the Cart Manager page. Renders the cart manager table and controls to add,
 * rename, and remove carts, and set the current cart.
 */
class CartManagerComponent extends React.Component {
    constructor() {
        super();
        this.state = {
            // /cart-manager/ object to render if we detected a possible update
            updatedContext: null,
        };
        this.retrieveUpdatedCart = this.retrieveUpdatedCart.bind(this);
    }

    componentDidUpdate(prevProps) {
        if (!this.props.inProgress && prevProps.inProgress) {
            // Cart operations were in progress but no longer are, so retrieve and redraw the cart
            // manager page.
            this.retrieveUpdatedCart();
        }
    }

    /**
     * Usually called in reaction to a possible change to the cart manager object, loads the
     * current cart object into this component's `updatedContext` state.
     */
    retrieveUpdatedCart() {
        cartRetrieve(this.props.context['@id'], this.props.fetch).then((response) => {
            this.setState({ updatedContext: response });
        });
    }

    render() {
        const { context, currentCart, inProgress, sessionProperties, fetch } = this.props;
        const cartContext = this.state.updatedContext || context;
        const extantCartCount = cartContext['@graph'].reduce((sum, cart) => (cart.status !== 'deleted' && cart.status !== 'disabled' ? sum + 1 : sum), 0);
        const user = sessionProperties && sessionProperties.user;
        const cartPanelHeader = (
            <div className="cart-manager-header">
                <h4 className="cart-manager-header__title">Cohort manager</h4>
                <NameCartButton
                    cartManager={cartContext}
                    user={user}
                    fetch={fetch}
                    disabled={extantCartCount >= cartContext.cart_user_max || inProgress}
                    updateCartManager={this.retrieveUpdatedCart}
                    create
                    actuatorCss="cart-manager-header__control"
                />
            </div>
        );
        return (
            <SortTablePanel header={cartPanelHeader}>
                <SortTable
                    list={cartContext['@graph']}
                    columns={cartTableColumns}
                    meta={{
                        cartManager: cartContext,
                        current: currentCart,
                        operationInProgress: inProgress,
                        user: sessionProperties && sessionProperties.user,
                        admin: !!(sessionProperties && sessionProperties.admin),
                        updateCartManager: this.retrieveUpdatedCart,
                        fetch,
                    }}
                    title={<CartCounts cartManager={cartContext} />}
                    rowClasses={
                        (item) => {
                            if (item['@id'] === currentCart) {
                                return 'cart-manager-table__current-row';
                            }
                            if (item.status === 'deleted') {
                                return 'cart-manager-table__deleted-row';
                            }
                            if (item.status === 'disabled') {
                                return 'cart-manager-table__autosave-row';
                            }
                            return '';
                        }
                    }
                    footer={<CartManagerFooter />}
                />
            </SortTablePanel>
        );
    }
}

CartManagerComponent.propTypes = {
    /** Cart manager context object */
    context: PropTypes.object.isRequired,
    /** <App> session_properties */
    sessionProperties: PropTypes.object.isRequired,
    /** @id of the current cart */
    currentCart: PropTypes.string.isRequired,
    /** True if global cart operation in progress */
    inProgress: PropTypes.bool.isRequired,
    /** System fetch function */
    fetch: PropTypes.func.isRequired,
};

const mapStateToProps = (state, ownProps) => ({
    currentCart: state.current,
    inProgress: state.inProgress,
    context: ownProps.context,
    sessionProperties: ownProps.sessionProperties,
    fetch: ownProps.fetch,
});

const CartManagerInternal = connect(mapStateToProps)(CartManagerComponent);

const CartManager = (props, reactContext) => (
    <CartManagerInternal context={props.context} sessionProperties={reactContext.session_properties} fetch={reactContext.fetch} navigate={reactContext.navigate} />
);

CartManager.propTypes = {
    /** Cart object from server, either for shared cart or 'cart-view' */
    context: PropTypes.object.isRequired,
};

CartManager.contextTypes = {
    session_properties: PropTypes.object,
    fetch: PropTypes.func,
};

export default CartManager;
